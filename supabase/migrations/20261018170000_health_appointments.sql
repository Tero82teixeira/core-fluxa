-- FLUXA Saúde: agenda e atendimentos administrativos.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.

CREATE TABLE IF NOT EXISTS public.health_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_profile_id uuid NOT NULL REFERENCES public.health_patient_profiles(id) ON DELETE RESTRICT,
  professional_user_id uuid,
  service_label text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'agendado',
  location text,
  administrative_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_appointments_time_check CHECK (ends_at > starts_at),
  CONSTRAINT health_appointments_status_check
    CHECK (status IN ('agendado','confirmado','concluido','faltou','cancelado'))
);

CREATE INDEX IF NOT EXISTS health_appointments_org_start_idx
  ON public.health_appointments(organization_id, starts_at);
CREATE INDEX IF NOT EXISTS health_appointments_professional_start_idx
  ON public.health_appointments(organization_id, professional_user_id, starts_at)
  WHERE professional_user_id IS NOT NULL;

ALTER TABLE public.health_appointments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.health_appointments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_health_appointment_professionals(
  _organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
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

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', member.user_id,
        'name', profile.full_name,
        'email', profile.email
      )
      ORDER BY COALESCE(profile.full_name, profile.email, member.user_id::text)
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.organization_members member
  LEFT JOIN public.profiles profile ON profile.id = member.user_id
  WHERE member.organization_id = _organization_id
    AND member.is_active
    AND member.role::text <> 'cliente_externo';

  RETURN result;
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
        'administrative_notes', appointment.administrative_notes
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
  WHERE appointment.organization_id = _organization_id
    AND (appointment.starts_at AT TIME ZONE timezone_name)::date = _date;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_health_appointment(
  _organization_id uuid,
  _patient_profile_id uuid,
  _professional_user_id uuid,
  _service_label text,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _location text DEFAULT NULL,
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

  IF _ends_at <= _starts_at OR _ends_at > (_starts_at + interval '12 hours') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_TIME_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.health_patient_profiles patient
    WHERE patient.id = _patient_profile_id
      AND patient.organization_id = _organization_id
      AND patient.administrative_status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PATIENT_INVALID' USING ERRCODE='22023';
  END IF;

  IF _professional_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.organization_members member
    WHERE member.organization_id = _organization_id
      AND member.user_id = _professional_user_id
      AND member.is_active
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PROFESSIONAL_INVALID' USING ERRCODE='22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      _organization_id::text || ':' || COALESCE(_professional_user_id::text, 'sem-profissional'),
      0
    )
  );

  IF _professional_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.health_appointments existing
    WHERE existing.organization_id = _organization_id
      AND existing.professional_user_id = _professional_user_id
      AND existing.status IN ('agendado','confirmado')
      AND tstzrange(existing.starts_at, existing.ends_at, '[)') &&
          tstzrange(_starts_at, _ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PROFESSIONAL_CONFLICT' USING ERRCODE='23P01';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.health_appointments existing
    WHERE existing.organization_id = _organization_id
      AND existing.patient_profile_id = _patient_profile_id
      AND existing.status IN ('agendado','confirmado')
      AND tstzrange(existing.starts_at, existing.ends_at, '[)') &&
          tstzrange(_starts_at, _ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PATIENT_CONFLICT' USING ERRCODE='23P01';
  END IF;

  INSERT INTO public.health_appointments(
    organization_id,
    patient_profile_id,
    professional_user_id,
    service_label,
    starts_at,
    ends_at,
    location,
    administrative_notes,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    _patient_profile_id,
    _professional_user_id,
    clean_service,
    _starts_at,
    _ends_at,
    NULLIF(trim(COALESCE(_location, '')), ''),
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO appointment;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  )
  VALUES (
    _organization_id,
    auth.uid(),
    'health.appointment.created',
    'health_appointment',
    appointment.id,
    jsonb_build_object(
      'patient_profile_id', appointment.patient_profile_id,
      'professional_user_id', appointment.professional_user_id,
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

  IF _status NOT IN ('agendado','confirmado','concluido','faltou','cancelado') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  UPDATE public.health_appointments
  SET status = _status,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = _appointment_id
    AND organization_id = _organization_id
  RETURNING * INTO appointment;

  IF appointment.id IS NULL THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  )
  VALUES (
    _organization_id,
    auth.uid(),
    'health.appointment.status_changed',
    'health_appointment',
    appointment.id,
    jsonb_build_object('status', appointment.status)
  );

  RETURN to_jsonb(appointment);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_appointment_professionals(uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_health_appointments(uuid, date)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_appointment(uuid, uuid, uuid, text, timestamptz, timestamptz, text, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_health_appointment_status(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_appointment_professionals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_health_appointments(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_appointment(uuid, uuid, uuid, text, timestamptz, timestamptz, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_health_appointment_status(uuid, uuid, text)
  TO authenticated;


-- Organizações de Saúde que já usam Pacientes recebem a Agenda na ativação inicial
-- desta entrega. Configurações futuras continuam respeitando a seleção de módulos da empresa.
UPDATE public.organization_settings
SET enabled_modules = enabled_modules || '["health_appointments"]'::jsonb
WHERE business_segment = 'health'
  AND jsonb_typeof(enabled_modules) = 'array'
  AND enabled_modules ? 'health_patients'
  AND NOT enabled_modules ? 'health_appointments';
