-- FLUXA Saúde: integração administrativa entre Agenda e Contas Médicas.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.

ALTER TABLE public.health_billing_items
  ADD COLUMN IF NOT EXISTS appointment_id uuid
    REFERENCES public.health_appointments(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS health_billing_items_appointment_unique_idx
  ON public.health_billing_items(organization_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

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
      SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = settings.timezone
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

CREATE OR REPLACE FUNCTION public.complete_health_appointment_and_create_billing(
  _organization_id uuid,
  _appointment_id uuid,
  _amount numeric,
  _insurer_id uuid DEFAULT NULL,
  _authorization_id uuid DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  appointment public.health_appointments;
  billing public.health_billing_items;
  authorization_row public.health_authorizations;
  resolved_insurer_id uuid := _insurer_id;
  timezone_name text := 'America/Sao_Paulo';
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_BILLING_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_appointments')
     OR NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_BILLING_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_BILLING_AMOUNT_INVALID' USING ERRCODE='22023';
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

  IF appointment.status IN ('faltou', 'cancelado') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_BILLING_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.health_billing_items existing
    WHERE existing.organization_id = _organization_id
      AND existing.appointment_id = appointment.id
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_ALREADY_BILLED' USING ERRCODE='23505';
  END IF;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = settings.timezone
    ) THEN settings.timezone
    ELSE 'America/Sao_Paulo'
  END
  INTO timezone_name
  FROM public.organization_settings settings
  WHERE settings.organization_id = _organization_id;

  timezone_name := COALESCE(timezone_name, 'America/Sao_Paulo');

  IF _authorization_id IS NOT NULL THEN
    SELECT *
    INTO authorization_row
    FROM public.health_authorizations
    WHERE id = _authorization_id
      AND organization_id = _organization_id
      AND patient_profile_id = appointment.patient_profile_id
      AND (valid_until IS NULL OR valid_until >= (appointment.starts_at AT TIME ZONE timezone_name)::date);

    IF authorization_row.id IS NULL OR authorization_row.status <> 'autorizado' THEN
      RAISE EXCEPTION 'HEALTH_APPOINTMENT_BILLING_AUTHORIZATION_INVALID' USING ERRCODE='22023';
    END IF;

    IF _insurer_id IS NOT NULL
       AND authorization_row.insurer_id IS DISTINCT FROM _insurer_id THEN
      RAISE EXCEPTION 'HEALTH_APPOINTMENT_BILLING_INSURER_MISMATCH' USING ERRCODE='22023';
    END IF;

    resolved_insurer_id := COALESCE(_insurer_id, authorization_row.insurer_id);
  END IF;

  IF resolved_insurer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.health_insurers insurer
    WHERE insurer.id = resolved_insurer_id
      AND insurer.organization_id = _organization_id
      AND insurer.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_BILLING_INSURER_INVALID' USING ERRCODE='22023';
  END IF;

  UPDATE public.health_appointments
  SET status = 'concluido',
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = appointment.id;

  INSERT INTO public.health_billing_items(
    organization_id,
    patient_profile_id,
    insurer_id,
    authorization_id,
    appointment_id,
    service_label,
    service_date,
    amount,
    due_date,
    status,
    administrative_notes,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    appointment.patient_profile_id,
    resolved_insurer_id,
    _authorization_id,
    appointment.id,
    appointment.service_label,
    (appointment.starts_at AT TIME ZONE timezone_name)::date,
    _amount,
    _due_date,
    'rascunho',
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO billing;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES
    (
      _organization_id,
      auth.uid(),
      'health.appointment.completed_and_billed',
      'health_appointment',
      appointment.id,
      jsonb_build_object('billing_item_id', billing.id, 'amount', billing.amount)
    ),
    (
      _organization_id,
      auth.uid(),
      'health.billing.created_from_appointment',
      'health_billing_item',
      billing.id,
      jsonb_build_object(
        'appointment_id', appointment.id,
        'patient_profile_id', appointment.patient_profile_id,
        'amount', billing.amount,
        'status', billing.status
      )
    );

  RETURN jsonb_build_object(
    'appointment_id', appointment.id,
    'appointment_status', 'concluido',
    'billing_item_id', billing.id,
    'billing_status', billing.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_health_appointment_and_create_billing(
  uuid, uuid, numeric, uuid, uuid, date, text
) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.complete_health_appointment_and_create_billing(
  uuid, uuid, numeric, uuid, uuid, date, text
) TO authenticated;
