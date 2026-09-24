-- FLUXA Advocacia V1.2: agenda jurídica e lembretes de audiência.
-- Reutiliza o relógio temporal único; nenhum novo pg_cron é criado.

CREATE OR REPLACE FUNCTION public.list_legal_agenda(
  _organization_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','visualizador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'LEGAL_AGENDA_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.legal_module_enabled(_organization_id) THEN
    RAISE EXCEPTION 'LEGAL_AGENDA_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF _from IS NULL OR _to IS NULL OR _to <= _from OR _to > _from + interval '62 days' THEN
    RAISE EXCEPTION 'LEGAL_AGENDA_RANGE_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', profile.id,
        'process_id', process.id,
        'process_code', process.code,
        'process_title', process.title,
        'client_name', client.name,
        'next_hearing_at', profile.next_hearing_at,
        'court', profile.court,
        'judicial_unit', profile.judicial_unit,
        'district', profile.district,
        'state', profile.state,
        'confidential', profile.confidential
      )
      ORDER BY profile.next_hearing_at, process.code
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.legal_case_profiles profile
  JOIN public.processes process
    ON process.id = profile.process_id
   AND process.organization_id = profile.organization_id
   AND process.archived_at IS NULL
  JOIN public.clients client
    ON client.id = process.client_id
   AND client.organization_id = profile.organization_id
   AND client.archived_at IS NULL
  WHERE profile.organization_id = _organization_id
    AND profile.next_hearing_at >= _from
    AND profile.next_hearing_at < _to;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_legal_operational_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  created_count integer := 0;
BEGIN
  WITH legal_orgs AS (
    SELECT
      organization.id AS organization_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM pg_catalog.pg_timezone_names AS zone
          WHERE zone.name = settings.timezone
        ) THEN settings.timezone
        ELSE 'America/Sao_Paulo'
      END AS timezone_name
    FROM public.organizations AS organization
    JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    WHERE organization.archived_at IS NULL
      AND settings.business_segment = 'legal'
  ), hearing_candidates AS (
    SELECT
      profile.organization_id,
      profile.id AS profile_id,
      process.id AS process_id,
      process.code,
      client.name AS client_name,
      profile.next_hearing_at,
      org.timezone_name,
      CASE
        WHEN profile.next_hearing_at <= _as_of + interval '2 hours' THEN '2h'
        WHEN profile.next_hearing_at <= _as_of + interval '24 hours' THEN '24h'
        ELSE '7d'
      END AS reminder_window,
      CASE
        WHEN profile.next_hearing_at <= _as_of + interval '2 hours'
          THEN 'Audiência em até 2 horas'
        WHEN profile.next_hearing_at <= _as_of + interval '24 hours'
          THEN 'Audiência nas próximas 24 horas'
        ELSE 'Audiência nos próximos 7 dias'
      END AS title
    FROM public.legal_case_profiles profile
    JOIN public.processes process
      ON process.id = profile.process_id
     AND process.organization_id = profile.organization_id
     AND process.archived_at IS NULL
    JOIN public.clients client
      ON client.id = process.client_id
     AND client.organization_id = profile.organization_id
     AND client.archived_at IS NULL
    JOIN legal_orgs org ON org.organization_id = profile.organization_id
    WHERE public.legal_module_enabled(profile.organization_id)
      AND profile.next_hearing_at > _as_of
      AND profile.next_hearing_at <= _as_of + interval '7 days'
  ), recipients AS (
    SELECT
      candidate.*,
      member.user_id
    FROM hearing_candidates candidate
    JOIN public.organization_members member
      ON member.organization_id = candidate.organization_id
     AND member.is_active
     AND member.role::text = ANY(
       ARRAY['superadmin','proprietario','administrador','gestor','operacional']::text[]
     )
  )
  INSERT INTO public.notifications(
    organization_id,
    user_id,
    kind,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    dedupe_key
  )
  SELECT
    recipient.organization_id,
    recipient.user_id,
    'legal',
    recipient.title,
    left(
      format(
        '%s · %s · %s.',
        recipient.code,
        recipient.client_name,
        to_char(recipient.next_hearing_at AT TIME ZONE recipient.timezone_name, 'DD/MM/YYYY às HH24:MI')
      ),
      500
    ),
    'legal_hearing',
    recipient.profile_id,
    '/processos/' || recipient.process_id::text,
    'legal-hearing:' || recipient.profile_id::text || ':' ||
      recipient.next_hearing_at::text || ':' || recipient.reminder_window || ':' ||
      recipient.user_id::text
  FROM recipients recipient
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$function$;

-- Preserva todas as etapas existentes em uma função interna e mantém o nome
-- público usado pelo único cron do FLUXA como um invólucro seguro.
ALTER FUNCTION public.run_temporal_automation_cycle()
  RENAME TO run_temporal_automation_cycle_core;

CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  core_result jsonb;
  legal_alert_count integer := 0;
BEGIN
  core_result := public.run_temporal_automation_cycle_core();

  BEGIN
    legal_alert_count := public.create_legal_operational_notifications();
  EXCEPTION WHEN OTHERS THEN
    legal_alert_count := -1;
    RAISE WARNING 'LEGAL_OPERATIONAL_ALERT_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN core_result || jsonb_build_object(
    'legal_operational_notifications_created', legal_alert_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_legal_agenda(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_legal_agenda(uuid, timestamptz, timestamptz)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_legal_operational_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle_core()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_legal_operational_notifications(timestamptz)
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle_core()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
