-- FLUXA Saúde: recepção e fila administrativa do dia.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.

ALTER TABLE public.health_appointments
  ADD COLUMN IF NOT EXISTS reception_status text NOT NULL DEFAULT 'aguardando',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_started_at timestamptz;

ALTER TABLE public.health_appointments
  ADD CONSTRAINT health_appointments_reception_status_check
    CHECK (reception_status IN ('aguardando', 'chegou', 'em_atendimento'));

ALTER TABLE public.health_appointments
  ADD CONSTRAINT health_appointments_reception_timestamps_check
    CHECK (
      (reception_status = 'aguardando' AND checked_in_at IS NULL AND service_started_at IS NULL)
      OR (reception_status = 'chegou' AND checked_in_at IS NOT NULL AND service_started_at IS NULL)
      OR (
        reception_status = 'em_atendimento'
        AND checked_in_at IS NOT NULL
        AND service_started_at IS NOT NULL
        AND service_started_at >= checked_in_at
      )
    );

CREATE OR REPLACE FUNCTION public.protect_health_appointment_after_check_in()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.reception_status <> 'aguardando'
     AND (
       NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.professional_user_id IS DISTINCT FROM OLD.professional_user_id
       OR NEW.location IS DISTINCT FROM OLD.location
     ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_RECEPTION_ALREADY_STARTED' USING ERRCODE='22023';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_health_appointment_after_check_in
  ON public.health_appointments;
CREATE TRIGGER protect_health_appointment_after_check_in
  BEFORE UPDATE OF starts_at, ends_at, professional_user_id, location
  ON public.health_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_health_appointment_after_check_in();

CREATE OR REPLACE FUNCTION public.update_health_appointment_reception_status(
  _organization_id uuid,
  _appointment_id uuid,
  _status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  appointment public.health_appointments;
  previous_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_RECEPTION_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_appointments') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF _status NOT IN ('chegou', 'em_atendimento') THEN
    RAISE EXCEPTION 'HEALTH_RECEPTION_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT *
  INTO appointment
  FROM public.health_appointments
  WHERE id = _appointment_id
    AND organization_id = _organization_id
  FOR UPDATE;

  IF appointment.id IS NULL THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  IF appointment.status NOT IN ('agendado', 'confirmado')
     OR (_status = 'chegou' AND appointment.reception_status <> 'aguardando')
     OR (_status = 'em_atendimento' AND appointment.reception_status <> 'chegou') THEN
    RAISE EXCEPTION 'HEALTH_RECEPTION_TRANSITION_INVALID' USING ERRCODE='22023';
  END IF;

  previous_status := appointment.reception_status;

  UPDATE public.health_appointments
  SET reception_status = _status,
      checked_in_at = CASE
        WHEN _status = 'chegou' THEN now()
        ELSE checked_in_at
      END,
      service_started_at = CASE
        WHEN _status = 'em_atendimento' THEN now()
        ELSE service_started_at
      END,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = appointment.id
    AND organization_id = _organization_id
  RETURNING * INTO appointment;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  )
  VALUES (
    _organization_id,
    auth.uid(),
    CASE
      WHEN _status = 'chegou' THEN 'health.appointment.checked_in'
      ELSE 'health.appointment.service_started'
    END,
    'health_appointment',
    appointment.id,
    jsonb_build_object(
      'previous_status', previous_status,
      'reception_status', appointment.reception_status,
      'checked_in_at', appointment.checked_in_at,
      'service_started_at', appointment.service_started_at
    )
  );

  RETURN to_jsonb(appointment);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_health_appointments(
  _organization_id uuid,
  _date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
  timezone_name text := 'America/Sao_Paulo';
  can_view_billing boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_appointments') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  can_view_billing := public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) AND public.health_module_enabled(_organization_id, 'health_billing');

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name = settings.timezone
    ) THEN settings.timezone
    ELSE 'America/Sao_Paulo'
  END
  INTO timezone_name
  FROM public.organization_settings settings
  WHERE settings.organization_id = _organization_id;

  timezone_name := COALESCE(timezone_name, 'America/Sao_Paulo');

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', appointment.id,
        'patient_profile_id', appointment.patient_profile_id,
        'patient_name', client.name,
        'professional_user_id', appointment.professional_user_id,
        'professional_name', profile.full_name,
        'service_label', appointment.service_label,
        'starts_at', appointment.starts_at,
        'ends_at', appointment.ends_at,
        'status', appointment.status,
        'reception_status', appointment.reception_status,
        'checked_in_at', appointment.checked_in_at,
        'service_started_at', appointment.service_started_at,
        'location', appointment.location,
        'administrative_notes', appointment.administrative_notes,
        'billing_item_id', CASE WHEN can_view_billing THEN billing.id ELSE NULL END,
        'billing_status', CASE WHEN can_view_billing THEN billing.status ELSE NULL END
      )
      ORDER BY appointment.starts_at, client.name
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_appointments appointment
  JOIN public.health_patient_profiles patient
    ON patient.id = appointment.patient_profile_id
   AND patient.organization_id = appointment.organization_id
  JOIN public.clients client
    ON client.id = patient.client_id
   AND client.organization_id = appointment.organization_id
  LEFT JOIN public.profiles profile ON profile.id = appointment.professional_user_id
  LEFT JOIN public.health_billing_items billing
    ON billing.organization_id = appointment.organization_id
   AND billing.appointment_id = appointment.id
  WHERE appointment.organization_id = _organization_id
    AND (appointment.starts_at AT TIME ZONE timezone_name)::date = _date;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_health_appointments_range(
  _organization_id uuid,
  _start_date date,
  _end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
  timezone_name text := 'America/Sao_Paulo';
  can_view_billing boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_appointments') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL
     OR _end_date < _start_date
     OR _end_date > (_start_date + 30) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_RANGE_INVALID' USING ERRCODE='22023';
  END IF;

  can_view_billing := public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) AND public.health_module_enabled(_organization_id, 'health_billing');

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name = settings.timezone
    ) THEN settings.timezone
    ELSE 'America/Sao_Paulo'
  END
  INTO timezone_name
  FROM public.organization_settings settings
  WHERE settings.organization_id = _organization_id;

  timezone_name := COALESCE(timezone_name, 'America/Sao_Paulo');

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', appointment.id,
        'patient_profile_id', appointment.patient_profile_id,
        'patient_name', client.name,
        'professional_user_id', appointment.professional_user_id,
        'professional_name', profile.full_name,
        'service_label', appointment.service_label,
        'starts_at', appointment.starts_at,
        'ends_at', appointment.ends_at,
        'appointment_date', (appointment.starts_at AT TIME ZONE timezone_name)::date,
        'status', appointment.status,
        'reception_status', appointment.reception_status,
        'checked_in_at', appointment.checked_in_at,
        'service_started_at', appointment.service_started_at,
        'location', appointment.location,
        'administrative_notes', appointment.administrative_notes,
        'billing_item_id', CASE WHEN can_view_billing THEN billing.id ELSE NULL END,
        'billing_status', CASE WHEN can_view_billing THEN billing.status ELSE NULL END
      )
      ORDER BY appointment.starts_at, client.name
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_appointments appointment
  JOIN public.health_patient_profiles patient
    ON patient.id = appointment.patient_profile_id
   AND patient.organization_id = appointment.organization_id
  JOIN public.clients client
    ON client.id = patient.client_id
   AND client.organization_id = appointment.organization_id
  LEFT JOIN public.profiles profile ON profile.id = appointment.professional_user_id
  LEFT JOIN public.health_billing_items billing
    ON billing.organization_id = appointment.organization_id
   AND billing.appointment_id = appointment.id
  WHERE appointment.organization_id = _organization_id
    AND (appointment.starts_at AT TIME ZONE timezone_name)::date
      BETWEEN _start_date AND _end_date;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_health_appointment_reception_status(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.protect_health_appointment_after_check_in()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_health_appointment_reception_status(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_health_appointment_after_check_in()
  TO postgres;
