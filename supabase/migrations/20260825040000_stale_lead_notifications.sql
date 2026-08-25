-- Stage 40: notify active owners when leads remain without a confirmed contact
-- for three civil days and escalate after seven days. This scan is internal,
-- tenant-derived, idempotent and reuses the existing private 15-minute clock.

CREATE INDEX IF NOT EXISTS clients_stale_lead_interaction_idx
  ON public.clients(
    organization_id,
    (coalesce(last_interaction_at, created_at))
  )
  WHERE archived_at IS NULL AND status = 'lead';

CREATE OR REPLACE FUNCTION public.create_stale_lead_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  created_count integer := 0;
BEGIN
  WITH organization_config AS (
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
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    WHERE organization.archived_at IS NULL
      AND coalesce(
        settings.notification_preferences->>'stale_leads', 'true'
      ) <> 'false'
  ), lead_ages AS (
    SELECT
      client.organization_id,
      client.id AS client_id,
      client.name AS client_name,
      client.owner_id,
      coalesce(client.last_interaction_at, client.created_at) AS reference_at,
      (
        (_as_of AT TIME ZONE config.timezone_name)::date
        - (
          coalesce(client.last_interaction_at, client.created_at)
          AT TIME ZONE config.timezone_name
        )::date
      )::integer AS days_without_contact
    FROM organization_config AS config
    JOIN public.clients AS client
      ON client.organization_id = config.organization_id
    WHERE client.archived_at IS NULL
      AND client.status = 'lead'
      AND (_as_of AT TIME ZONE config.timezone_name)::time >= time '08:00'
      AND (
        coalesce(client.last_interaction_at, client.created_at)
        AT TIME ZONE config.timezone_name
      )::date <= (_as_of AT TIME ZONE config.timezone_name)::date - 3
  ), due_leads AS (
    SELECT
      lead.*,
      CASE
        WHEN lead.days_without_contact >= 7 THEN 7
        ELSE 3
      END AS stage
    FROM lead_ages AS lead
  ), owner_recipients AS (
    SELECT lead.*, member.user_id
    FROM due_leads AS lead
    JOIN public.organization_members AS member
      ON member.organization_id = lead.organization_id
     AND member.user_id = lead.owner_id
     AND member.is_active
  ), management_recipients AS (
    SELECT lead.*, manager.user_id
    FROM due_leads AS lead
    JOIN public.organization_members AS manager
      ON manager.organization_id = lead.organization_id
     AND manager.is_active
     AND manager.role::text IN (
       'superadmin', 'proprietario', 'administrador'
     )
    WHERE lead.stage = 7
       OR NOT EXISTS (
         SELECT 1
         FROM public.organization_members AS owner
         WHERE owner.organization_id = lead.organization_id
           AND owner.user_id = lead.owner_id
           AND owner.is_active
       )
  ), recipients AS (
    SELECT * FROM owner_recipients
    UNION
    SELECT * FROM management_recipients
  ), candidates AS (
    SELECT
      recipient.*,
      'stale-lead:' || recipient.client_id::text || ':' ||
        to_char(
          recipient.reference_at AT TIME ZONE 'UTC',
          'YYYYMMDDHH24MISSUS'
        ) || ':' || recipient.stage::text || ':' ||
        recipient.user_id::text AS dedupe_key
    FROM recipients AS recipient
  ), pending_candidates AS (
    SELECT candidate.*
    FROM candidates AS candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications AS existing
      WHERE existing.organization_id = candidate.organization_id
        AND existing.user_id = candidate.user_id
        AND existing.dedupe_key = candidate.dedupe_key
    )
    ORDER BY
      candidate.stage DESC,
      candidate.days_without_contact DESC,
      candidate.client_name,
      candidate.client_id,
      candidate.user_id
    LIMIT 200
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    candidate.organization_id,
    candidate.user_id,
    CASE candidate.stage
      WHEN 7 THEN 'Lead sem retorno há 7 dias: '
      ELSE 'Lead sem retorno há 3 dias: '
    END || left(candidate.client_name, 100),
    CASE candidate.stage
      WHEN 7 THEN format(
        '%s continua sem contato registrado há %s dias. Revise o acompanhamento e defina o próximo passo.',
        candidate.client_name,
        candidate.days_without_contact
      )
      ELSE format(
        '%s está sem contato registrado há %s dias. Faça o acompanhamento e registre o contato realizado.',
        candidate.client_name,
        candidate.days_without_contact
      )
    END,
    'communication',
    'cliente',
    candidate.client_id,
    '/clientes/' || candidate.client_id::text,
    candidate.dedupe_key
  FROM pending_candidates AS candidate
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Preserve every previously approved temporal stage and isolate this scan.
-- No additional pg_cron job is created by this migration.
CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
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
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    financial_recurrence_count :=
      public.process_due_financial_recurrences();
  EXCEPTION WHEN OTHERS THEN
    financial_recurrence_count := -1;
    RAISE WARNING 'FINANCIAL_RECURRENCE_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_financial_summary_count :=
      public.create_weekly_financial_summary_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_financial_summary_count := -1;
    RAISE WARNING 'WEEKLY_FINANCIAL_SUMMARY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_data_quality_count :=
      public.create_weekly_data_quality_notifications();
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
    client_birthday_count :=
      public.create_client_birthday_notifications();
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
    overdue_escalation_count :=
      public.create_overdue_task_escalation_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_escalation_count := -1;
    RAISE WARNING 'OVERDUE_TASK_ESCALATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_process_count := public.create_stale_process_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_process_count := -1;
    RAISE WARNING 'STALE_PROCESS_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_communication_count :=
      public.create_overdue_communication_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_communication_count := -1;
    RAISE WARNING 'OVERDUE_COMMUNICATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    expired_document_count :=
      public.create_expired_document_notifications();
  EXCEPTION WHEN OTHERS THEN
    expired_document_count := -1;
    RAISE WARNING 'EXPIRED_DOCUMENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_financial_count :=
      public.create_overdue_financial_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_financial_count := -1;
    RAISE WARNING 'OVERDUE_FINANCIAL_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created',
      financial_recurrence_count,
    'weekly_financial_summaries_created',
      weekly_financial_summary_count,
    'weekly_data_quality_notifications_created',
      weekly_data_quality_count,
    'stale_client_notifications_created', stale_client_count,
    'client_birthday_notifications_created', client_birthday_count,
    'stale_lead_notifications_created', stale_lead_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stale_lead_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_stale_lead_notifications(timestamptz)
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
