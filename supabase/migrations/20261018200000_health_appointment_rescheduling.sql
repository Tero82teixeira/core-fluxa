-- Reagendamento administrativo seguro de atendimentos do FLUXA Saúde.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.

CREATE OR REPLACE FUNCTION public.reschedule_health_appointment(
  _organization_id uuid,
  _appointment_id uuid,
  _professional_user_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _location text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  appointment public.health_appointments;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
  previous_professional_user_id uuid;
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

  IF _ends_at <= _starts_at OR _ends_at > (_starts_at + interval '12 hours') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_TIME_INVALID' USING ERRCODE='22023';
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

  IF appointment.status NOT IN ('agendado','confirmado') THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_RESCHEDULE_NOT_ALLOWED' USING ERRCODE='22023';
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

  -- Coordena a validação com novos agendamentos destinados ao mesmo responsável.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      _organization_id::text || ':' || COALESCE(_professional_user_id::text, 'sem-profissional'),
      0
    )
  );

  -- Serializa também mudanças do mesmo paciente, inclusive entre responsáveis diferentes.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      _organization_id::text || ':patient:' || appointment.patient_profile_id::text,
      0
    )
  );

  IF _professional_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.health_appointments existing
    WHERE existing.organization_id = _organization_id
      AND existing.id <> appointment.id
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
      AND existing.id <> appointment.id
      AND existing.patient_profile_id = appointment.patient_profile_id
      AND existing.status IN ('agendado','confirmado')
      AND tstzrange(existing.starts_at, existing.ends_at, '[)') &&
          tstzrange(_starts_at, _ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'HEALTH_APPOINTMENT_PATIENT_CONFLICT' USING ERRCODE='23P01';
  END IF;

  previous_starts_at := appointment.starts_at;
  previous_ends_at := appointment.ends_at;
  previous_professional_user_id := appointment.professional_user_id;
  previous_status := appointment.status;

  UPDATE public.health_appointments
  SET professional_user_id = _professional_user_id,
      starts_at = _starts_at,
      ends_at = _ends_at,
      location = NULLIF(trim(COALESCE(_location, '')), ''),
      status = 'agendado',
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
    'health.appointment.rescheduled',
    'health_appointment',
    appointment.id,
    jsonb_build_object(
      'previous_starts_at', previous_starts_at,
      'previous_ends_at', previous_ends_at,
      'previous_professional_user_id', previous_professional_user_id,
      'previous_status', previous_status,
      'starts_at', appointment.starts_at,
      'ends_at', appointment.ends_at,
      'professional_user_id', appointment.professional_user_id,
      'status', appointment.status
    )
  );

  RETURN to_jsonb(appointment);
END;
$function$;

REVOKE ALL ON FUNCTION public.reschedule_health_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_health_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text)
  TO authenticated;
