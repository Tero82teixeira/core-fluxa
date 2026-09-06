-- Notify the internal team when a shared Client Portal conversation reaches
-- 75% of its response SLA and escalate after the deadline. The latest public
-- message must belong to the client, preventing stale or manually reopened
-- conversations from producing false alerts.

CREATE OR REPLACE FUNCTION public.create_portal_sla_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  created_count integer := 0;
BEGIN
  WITH organization_config AS (
    SELECT organization.id AS organization_id
      FROM public.organizations AS organization
      LEFT JOIN public.organization_settings AS settings
        ON settings.organization_id = organization.id
     WHERE organization.archived_at IS NULL
       AND coalesce(settings.monitoring_show_communication, true)
       AND coalesce(
         settings.notification_preferences->>'portal_sla_alerts',
         'true'
       ) <> 'false'
  ), waiting_threads AS (
    SELECT
      thread.organization_id,
      thread.id AS thread_id,
      thread.subject,
      thread.priority,
      thread.assigned_to,
      client.name AS client_name,
      last_message.occurred_at AS waiting_since,
      last_message.occurred_at + CASE thread.priority::text
        WHEN 'urgente' THEN interval '2 hours'
        WHEN 'alta' THEN interval '4 hours'
        WHEN 'baixa' THEN interval '48 hours'
        ELSE interval '24 hours'
      END AS due_at,
      last_message.occurred_at + CASE thread.priority::text
        WHEN 'urgente' THEN interval '90 minutes'
        WHEN 'alta' THEN interval '3 hours'
        WHEN 'baixa' THEN interval '36 hours'
        ELSE interval '18 hours'
      END AS warning_at
      FROM public.communication_threads AS thread
      JOIN organization_config AS config
        ON config.organization_id = thread.organization_id
      JOIN public.client_portal_communication_shares AS share
        ON share.organization_id = thread.organization_id
       AND share.client_id = thread.client_id
       AND share.thread_id = thread.id
       AND share.is_shared
      JOIN public.clients AS client
        ON client.organization_id = thread.organization_id
       AND client.id = thread.client_id
       AND client.archived_at IS NULL
      JOIN LATERAL (
        SELECT
          entry.occurred_at,
          entry.metadata->>'source' AS source
          FROM public.communication_entries AS entry
         WHERE entry.organization_id = thread.organization_id
           AND entry.thread_id = thread.id
           AND entry.entry_type::text = 'mensagem'
           AND NOT entry.is_internal
         ORDER BY entry.occurred_at DESC, entry.created_at DESC, entry.id DESC
         LIMIT 1
      ) AS last_message ON last_message.source = 'client_portal'
     WHERE thread.archived_at IS NULL
       AND thread.status::text = 'aguardando_equipe'
  ), eligible_threads AS (
    SELECT
      thread.*,
      CASE WHEN _as_of >= thread.due_at THEN 2 ELSE 1 END AS notice_stage,
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM public.organization_members AS member
           WHERE member.organization_id = thread.organization_id
             AND member.user_id = thread.assigned_to
             AND member.is_active
        ) THEN thread.assigned_to
      END AS responsible_id
      FROM waiting_threads AS thread
     WHERE _as_of >= thread.warning_at
  ), recipients AS (
    SELECT thread.*, thread.responsible_id AS user_id
      FROM eligible_threads AS thread
     WHERE thread.responsible_id IS NOT NULL

    UNION

    SELECT thread.*, manager.user_id
      FROM eligible_threads AS thread
      JOIN public.organization_members AS manager
        ON manager.organization_id = thread.organization_id
       AND manager.is_active
       AND manager.role::text IN (
         'superadmin', 'proprietario', 'administrador', 'gestor'
       )
     WHERE thread.responsible_id IS NULL
        OR thread.notice_stage = 2
  )
  INSERT INTO public.notifications(
    organization_id,
    user_id,
    title,
    body,
    kind,
    entity_type,
    entity_id,
    action_url,
    dedupe_key
  )
  SELECT
    thread.organization_id,
    thread.user_id,
    CASE thread.notice_stage
      WHEN 1 THEN 'SLA próximo do limite: '
      ELSE 'SLA de atendimento atrasado: '
    END || left(
      coalesce(nullif(trim(thread.subject), ''), 'Conversa do portal'),
      100
    ),
    CASE thread.notice_stage
      WHEN 1 THEN format(
        'O cliente %s aguarda resposta. Restam aproximadamente %s minutos do SLA %s.',
        thread.client_name,
        greatest(0, ceil(extract(epoch FROM (thread.due_at - _as_of)) / 60))::integer,
        thread.priority::text
      )
      ELSE format(
        'O cliente %s continua aguardando. O SLA %s está atrasado há aproximadamente %s minutos.',
        thread.client_name,
        thread.priority::text,
        greatest(0, floor(extract(epoch FROM (_as_of - thread.due_at)) / 60))::integer
      )
    END,
    'communication',
    'comunicacao',
    thread.thread_id,
    '/comunicacao',
    'portal-sla:' || thread.thread_id::text || ':' ||
      to_char(thread.waiting_since AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US') ||
      ':' || thread.notice_stage::text || ':' || thread.user_id::text
    FROM recipients AS thread
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.notifications AS existing
      WHERE existing.organization_id = thread.organization_id
        AND existing.dedupe_key =
          'portal-sla:' || thread.thread_id::text || ':' ||
          to_char(
            thread.waiting_since AT TIME ZONE 'UTC',
            'YYYYMMDDHH24MISS.US'
          ) || ':' || thread.notice_stage::text || ':' || thread.user_id::text
   )
   ORDER BY thread.notice_stage DESC, thread.warning_at, thread.thread_id, thread.user_id
   LIMIT 200
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_portal_sla_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_portal_sla_notifications(timestamptz)
  TO postgres;

-- Keep the single private clock. This stage is isolated so a failure cannot
-- prevent any existing operational, commercial or billing automation.
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
  portal_sla_count integer := 0;
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
    portal_sla_count := public.create_portal_sla_notifications();
  EXCEPTION WHEN OTHERS THEN
    portal_sla_count := -1;
    RAISE WARNING 'PORTAL_SLA_SCAN_FAILED: %', SQLSTATE;
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
    'portal_sla_notifications_created', portal_sla_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created', financial_recurrence_count,
    'weekly_financial_summaries_created', weekly_financial_summary_count,
    'weekly_data_quality_notifications_created', weekly_data_quality_count,
    'stale_client_notifications_created', stale_client_count,
    'client_birthday_notifications_created', client_birthday_count,
    'stale_lead_notifications_created', stale_lead_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
