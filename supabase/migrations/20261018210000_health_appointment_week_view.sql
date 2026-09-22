-- Visão administrativa da Agenda por período curto.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.

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
        'appointment_date', (appointment.starts_at AT TIME ZONE timezone_name)::date,
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
    AND (appointment.starts_at AT TIME ZONE timezone_name)::date
      BETWEEN _start_date AND _end_date;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_appointments_range(uuid, date, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_health_appointments_range(uuid, date, date)
  TO authenticated;
