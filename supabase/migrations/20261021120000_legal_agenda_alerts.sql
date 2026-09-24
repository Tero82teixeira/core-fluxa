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

CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  scheduled_count integer;
  critical_count integer := 0;
  unassigned_count integer := 0;
  deadline_count integer := 0;
  overdue_escalation_count integer := 0;
  stale_process_count integer := 0;
  overdue_communication_count integer := 0;
  expired_document_count integer := 0;
  overdue_financial_count integer := 0;
  financial_recurrence_count integer := 0;
  weekly_financial_summary_count integer := 0;
  weekly_data_quality_count integer := 0;
  stale_client_count integer := 0;
  client_birthday_count integer := 0;
  stale_lead_count integer := 0;
  stale_task_count integer := 0;
  daily_operational_close_count integer := 0;
  weekly_productivity_report_count integer := 0;
  kiwify_expiry_count integer := 0;
  commercial_next_action_count integer := 0;
  payment_reminder_count integer := 0;
  health_alert_count integer := 0;
  legal_alert_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    kiwify_expiry_count := public.suspend_expired_kiwify_subscriptions();
  EXCEPTION WHEN OTHERS THEN
    kiwify_expiry_count := -1;
    RAISE WARNING 'KIWIFY_SUBSCRIPTION_EXPIRY_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_productivity_report_count := public.create_weekly_productivity_report_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_productivity_report_count := -1;
    RAISE WARNING 'WEEKLY_PRODUCTIVITY_REPORT_FAILED: %', SQLSTATE;
  END;

  BEGIN
    daily_operational_close_count := public.create_daily_operational_close_notifications();
  EXCEPTION WHEN OTHERS THEN
    daily_operational_close_count := -1;
    RAISE WARNING 'DAILY_OPERATIONAL_CLOSE_FAILED: %', SQLSTATE;
  END;

  BEGIN
    financial_recurrence_count := public.process_due_financial_recurrences();
  EXCEPTION WHEN OTHERS THEN
    financial_recurrence_count := -1;
    RAISE WARNING 'FINANCIAL_RECURRENCE_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_financial_summary_count := public.create_weekly_financial_summary_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_financial_summary_count := -1;
    RAISE WARNING 'WEEKLY_FINANCIAL_SUMMARY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_data_quality_count := public.create_weekly_data_quality_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_data_quality_count := -1;
    RAISE WARNING 'WEEKLY_DATA_QUALITY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_client_count := public.create_stale_client_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_client_count := -1;
    RAISE WARNING 'STALE_CLIENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    client_birthday_count := public.create_client_birthday_notifications();
  EXCEPTION WHEN OTHERS THEN
    client_birthday_count := -1;
    RAISE WARNING 'CLIENT_BIRTHDAY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_lead_count := public.create_stale_lead_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_lead_count := -1;
    RAISE WARNING 'STALE_LEAD_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    critical_count := public.create_critical_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    critical_count := -1;
    RAISE WARNING 'CRITICAL_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    unassigned_count := public.create_unassigned_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    unassigned_count := -1;
    RAISE WARNING 'UNASSIGNED_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    deadline_count := public.create_deadline_reminder_notifications();
  EXCEPTION WHEN OTHERS THEN
    deadline_count := -1;
    RAISE WARNING 'DEADLINE_REMINDER_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_escalation_count := public.create_overdue_task_escalation_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_escalation_count := -1;
    RAISE WARNING 'OVERDUE_TASK_ESCALATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_task_count := public.create_stale_task_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_task_count := -1;
    RAISE WARNING 'STALE_TASK_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_process_count := public.create_stale_process_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_process_count := -1;
    RAISE WARNING 'STALE_PROCESS_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_communication_count := public.create_overdue_communication_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_communication_count := -1;
    RAISE WARNING 'OVERDUE_COMMUNICATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    expired_document_count := public.create_expired_document_notifications();
  EXCEPTION WHEN OTHERS THEN
    expired_document_count := -1;
    RAISE WARNING 'EXPIRED_DOCUMENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_financial_count := public.create_overdue_financial_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_financial_count := -1;
    RAISE WARNING 'OVERDUE_FINANCIAL_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    commercial_next_action_count := public.create_commercial_next_action_notifications();
  EXCEPTION WHEN OTHERS THEN
    commercial_next_action_count := -1;
    RAISE WARNING 'COMMERCIAL_NEXT_ACTION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    payment_reminder_count := public.create_asaas_client_payment_notifications();
  EXCEPTION WHEN OTHERS THEN
    payment_reminder_count := -1;
    RAISE WARNING 'ASAAS_CLIENT_PAYMENT_REMINDER_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    health_alert_count := public.create_health_operational_notifications();
  EXCEPTION WHEN OTHERS THEN
    health_alert_count := -1;
    RAISE WARNING 'HEALTH_OPERATIONAL_ALERT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    legal_alert_count := public.create_legal_operational_notifications();
  EXCEPTION WHEN OTHERS THEN
    legal_alert_count := -1;
    RAISE WARNING 'LEGAL_OPERATIONAL_ALERT_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'kiwify_subscriptions_suspended', kiwify_expiry_count,
    'weekly_productivity_reports_created', weekly_productivity_report_count,
    'daily_operational_close_notifications_created', daily_operational_close_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_task_notifications_created', stale_task_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created', overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created', financial_recurrence_count,
    'weekly_financial_summaries_created', weekly_financial_summary_count,
    'weekly_data_quality_notifications_created', weekly_data_quality_count,
    'stale_client_notifications_created', stale_client_count,
    'client_birthday_notifications_created', client_birthday_count,
    'stale_lead_notifications_created', stale_lead_count,
    'commercial_next_action_notifications_created', commercial_next_action_count,
    'asaas_client_payment_reminders_created', payment_reminder_count,
    'health_operational_notifications_created', health_alert_count,
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
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_legal_operational_notifications(timestamptz)
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
