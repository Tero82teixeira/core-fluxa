-- FLUXA Saúde: agenda e atendimentos administrativos.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.

CREATE TABLE IF NOT EXISTS public.health_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_profile_id uuid NOT NULL REFERENCES public.health_patient_profiles(id) ON DELETE RESTRICT,
  authorization_id uuid REFERENCES public.health_authorizations(id) ON DELETE SET NULL,
  responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  service_label text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  modality text NOT NULL DEFAULT 'presencial',
  location text,
  status text NOT NULL DEFAULT 'agendado',
  administrative_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_appointments_period_check CHECK (ends_at > starts_at),
  CONSTRAINT health_appointments_service_length_check
    CHECK (length(trim(service_label)) BETWEEN 1 AND 180),
  CONSTRAINT health_appointments_location_length_check
    CHECK (location IS NULL OR length(location) <= 180),
  CONSTRAINT health_appointments_notes_length_check
    CHECK (administrative_notes IS NULL OR length(administrative_notes) <= 500),
  CONSTRAINT health_appointments_modality_check
    CHECK (modality IN ('presencial','remoto','domiciliar','outro')),
  CONSTRAINT health_appointments_status_check
    CHECK (status IN ('agendado','confirmado','em_atendimento','concluido','faltou','cancelado'))
);

CREATE INDEX IF NOT EXISTS health_appointments_org_starts_idx
  ON public.health_appointments(organization_id, starts_at);

CREATE INDEX IF NOT EXISTS health_appointments_org_responsible_period_idx
  ON public.health_appointments(organization_id, responsible_user_id, starts_at, ends_at)
  WHERE responsible_user_id IS NOT NULL
    AND status IN ('agendado','confirmado','em_atendimento');

CREATE INDEX IF NOT EXISTS health_appointments_org_patient_idx
  ON public.health_appointments(organization_id, patient_profile_id, starts_at DESC);

ALTER TABLE public.health_appointments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.health_appointments FROM PUBLIC, anon, authenticated;

-- Organizações de Saúde já configuradas recebem o novo módulo sem refazer o onboarding.
UPDATE public.organization_settings
SET enabled_modules = COALESCE(enabled_modules, '[]'::jsonb) || '["health_appointments"]'::jsonb
WHERE business_segment = 'health'
  AND NOT (COALESCE(enabled_modules, '[]'::jsonb) ? 'health_appointments');

CREATE OR REPLACE FUNCTION public.list_health_appointments(
  _organization_id uuid,
  _starts_from timestamptz,
  _starts_until timestamptz,
  _search text DEFAULT NULL,
  _status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
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

  IF _starts_from IS NULL OR _starts_until IS NULL OR _starts_until <= _starts_from THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PERIOD_INVALID' USING ERRCODE='22023';
  END IF;

  IF _starts_until - _starts_from > interval '93 days' THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_RANGE_TOO_LARGE' USING ERRCODE='22023';
  END IF;

  IF _status IS NOT NULL AND _status NOT IN (
    'agendado','confirmado','em_atendimento','concluido','faltou','cancelado'
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', appointment.id,
        'patient_profile_id', appointment.patient_profile_id,
        'patient_name', client.name,
        'patient_phone', client.phone,
        'authorization_id', appointment.authorization_id,
        'authorization_number', authorization.authorization_number,
        'responsible_user_id', appointment.responsible_user_id,
        'responsible_name', profile.full_name,
        'service_label', appointment.service_label,
        'starts_at', appointment.starts_at,
        'ends_at', appointment.ends_at,
        'modality', appointment.modality,
        'location', appointment.location,
        'status', appointment.status,
        'administrative_notes', appointment.administrative_notes,
        'created_at', appointment.created_at
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
  LEFT JOIN public.health_authorizations authorization
    ON authorization.id = appointment.authorization_id
   AND authorization.organization_id = appointment.organization_id
  LEFT JOIN public.profiles profile ON profile.id = appointment.responsible_user_id
  WHERE appointment.organization_id = _organization_id
    AND appointment.starts_at >= _starts_from
    AND appointment.starts_at < _starts_until
    AND (_status IS NULL OR appointment.status = _status)
    AND (
      NULLIF(trim(COALESCE(_search, '')), '') IS NULL
      OR client.name ILIKE '%' || trim(_search) || '%'
      OR appointment.service_label ILIKE '%' || trim(_search) || '%'
      OR COALESCE(profile.full_name, '') ILIKE '%' || trim(_search) || '%'
      OR COALESCE(appointment.location, '') ILIKE '%' || trim(_search) || '%'
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_health_appointment(
  _organization_id uuid,
  _patient_profile_id uuid,
  _service_label text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _responsible_user_id uuid DEFAULT NULL,
  _authorization_id uuid DEFAULT NULL,
  _modality text DEFAULT 'presencial',
  _location text DEFAULT NULL,
  _status text DEFAULT 'agendado',
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  appointment public.health_appointments;
  clean_service text := NULLIF(trim(_service_label), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_appointments') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_service IS NULL THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_SERVICE_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF length(clean_service) > 180
     OR length(COALESCE(_location, '')) > 180
     OR length(COALESCE(_administrative_notes, '')) > 500
  THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_TEXT_TOO_LONG' USING ERRCODE='22023';
  END IF;

  IF _starts_at IS NULL OR _ends_at IS NULL OR _ends_at <= _starts_at THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PERIOD_INVALID' USING ERRCODE='22023';
  END IF;

  IF _ends_at - _starts_at > interval '24 hours' THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_DURATION_INVALID' USING ERRCODE='22023';
  END IF;

  IF _modality NOT IN ('presencial','remoto','domiciliar','outro') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_MODALITY_INVALID' USING ERRCODE='22023';
  END IF;

  IF _status NOT IN ('agendado','confirmado','em_atendimento','concluido','faltou','cancelado') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.health_patient_profiles
    WHERE id = _patient_profile_id
      AND organization_id = _organization_id
      AND administrative_status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PATIENT_INVALID' USING ERRCODE='22023';
  END IF;

  IF _responsible_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _organization_id
      AND user_id = _responsible_user_id
      AND is_active
      AND role <> 'cliente_externo'
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_RESPONSIBLE_INVALID' USING ERRCODE='22023';
  END IF;

  IF _authorization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.health_authorizations
    WHERE id = _authorization_id
      AND organization_id = _organization_id
      AND patient_profile_id = _patient_profile_id
      AND status = 'autorizado'
      AND (valid_until IS NULL OR valid_until >= (_starts_at AT TIME ZONE 'America/Sao_Paulo')::date)
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_AUTHORIZATION_INVALID' USING ERRCODE='22023';
  END IF;

  IF _responsible_user_id IS NOT NULL
     AND _status IN ('agendado','confirmado','em_atendimento')
  THEN
    -- Serializa agendamentos do mesmo profissional para impedir dupla reserva
    -- inclusive quando duas requisições chegam simultaneamente.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(_organization_id::text || ':' || _responsible_user_id::text, 0)
    );

    IF EXISTS (
       SELECT 1 FROM public.health_appointments existing
       WHERE existing.organization_id = _organization_id
         AND existing.responsible_user_id = _responsible_user_id
         AND existing.status IN ('agendado','confirmado','em_atendimento')
         AND existing.starts_at < _ends_at
         AND existing.ends_at > _starts_at
    ) THEN
      RAISE EXCEPTION 'HEALTH_APPOINTMENT_SCHEDULE_CONFLICT' USING ERRCODE='23P01';
    END IF;
  END IF;

  INSERT INTO public.health_appointments(
    organization_id,
    patient_profile_id,
    authorization_id,
    responsible_user_id,
    service_label,
    starts_at,
    ends_at,
    modality,
    location,
    status,
    administrative_notes,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    _patient_profile_id,
    _authorization_id,
    _responsible_user_id,
    clean_service,
    _starts_at,
    _ends_at,
    _modality,
    NULLIF(trim(COALESCE(_location, '')), ''),
    _status,
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO appointment;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.appointment.created',
    'health_appointment',
    appointment.id,
    jsonb_build_object(
      'patient_profile_id', appointment.patient_profile_id,
      'responsible_user_id', appointment.responsible_user_id,
      'starts_at', appointment.starts_at,
      'status', appointment.status
    )
  );

  RETURN to_jsonb(appointment);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_health_appointment_status(
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
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_appointments') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF _status NOT IN ('agendado','confirmado','em_atendimento','concluido','faltou','cancelado') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT status INTO previous_status
  FROM public.health_appointments
  WHERE id = _appointment_id AND organization_id = _organization_id
  FOR UPDATE;

  IF previous_status IS NULL THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT * INTO appointment
  FROM public.health_appointments
  WHERE id = _appointment_id AND organization_id = _organization_id;

  IF appointment.responsible_user_id IS NOT NULL
     AND _status IN ('agendado','confirmado','em_atendimento')
     AND previous_status NOT IN ('agendado','confirmado','em_atendimento')
  THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(_organization_id::text || ':' || appointment.responsible_user_id::text, 0)
    );

    IF EXISTS (
      SELECT 1 FROM public.health_appointments existing
      WHERE existing.organization_id = _organization_id
        AND existing.id <> _appointment_id
        AND existing.responsible_user_id = appointment.responsible_user_id
        AND existing.status IN ('agendado','confirmado','em_atendimento')
        AND existing.starts_at < appointment.ends_at
        AND existing.ends_at > appointment.starts_at
    ) THEN
      RAISE EXCEPTION 'HEALTH_APPOINTMENT_SCHEDULE_CONFLICT' USING ERRCODE='23P01';
    END IF;
  END IF;

  UPDATE public.health_appointments
  SET status = _status,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _appointment_id
    AND organization_id = _organization_id
  RETURNING * INTO appointment;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.appointment.status_updated',
    'health_appointment',
    appointment.id,
    jsonb_build_object('previous_status', previous_status, 'status', appointment.status)
  );

  RETURN to_jsonb(appointment);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_appointments(uuid, timestamptz, timestamptz, text, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_appointment(uuid, uuid, text, timestamptz, timestamptz, uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_health_appointment_status(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_appointments(uuid, timestamptz, timestamptz, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_appointment(uuid, uuid, text, timestamptz, timestamptz, uuid, uuid, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_health_appointment_status(uuid, uuid, text)
  TO authenticated;
