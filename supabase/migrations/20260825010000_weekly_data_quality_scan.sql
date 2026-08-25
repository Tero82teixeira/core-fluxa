-- Stage 37: run a conservative weekly data-quality scan every Tuesday after
-- 08:00 in each active organization's timezone. The scan only reports proven
-- inconsistencies, never changes source records, and reuses the single clock.

CREATE OR REPLACE FUNCTION public.create_weekly_data_quality_notifications(
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
  WITH organization_timezones AS (
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
  ), reporting_organizations AS (
    SELECT
      config.organization_id,
      date_trunc(
        'week', _as_of AT TIME ZONE config.timezone_name
      )::date AS week_start
    FROM organization_timezones AS config
    WHERE extract(
      isodow FROM (_as_of AT TIME ZONE config.timezone_name)
    ) = 2
      AND (_as_of AT TIME ZONE config.timezone_name)::time >= time '08:00'
  ), quality_issues AS (
    SELECT
      config.organization_id,
      'organization_missing_owner'::text AS issue_kind
    FROM reporting_organizations AS config
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      WHERE member.organization_id = config.organization_id
        AND member.is_active
        AND member.role::text = 'proprietario'
    )

    UNION ALL

    SELECT task.organization_id, 'task_completion_missing'
    FROM reporting_organizations AS config
    JOIN public.tasks AS task
      ON task.organization_id = config.organization_id
    WHERE task.archived_at IS NULL
      AND task.deleted_at IS NULL
      AND task.status::text = 'concluida'
      AND (task.completed_at IS NULL OR task.completed_by IS NULL)

    UNION ALL

    SELECT task.organization_id, 'task_completion_stale'
    FROM reporting_organizations AS config
    JOIN public.tasks AS task
      ON task.organization_id = config.organization_id
    WHERE task.archived_at IS NULL
      AND task.deleted_at IS NULL
      AND task.status::text NOT IN ('concluida', 'arquivada')
      AND (task.completed_at IS NOT NULL OR task.completed_by IS NOT NULL)

    UNION ALL

    SELECT task.organization_id, 'task_inactive_assignee'
    FROM reporting_organizations AS config
    JOIN public.tasks AS task
      ON task.organization_id = config.organization_id
    WHERE task.archived_at IS NULL
      AND task.deleted_at IS NULL
      AND task.assignee_id IS NOT NULL
      AND task.status::text NOT IN ('concluida', 'cancelada', 'arquivada')
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = task.organization_id
          AND member.user_id = task.assignee_id
          AND member.is_active
      )

    UNION ALL

    SELECT client.organization_id, 'client_inactive_owner'
    FROM reporting_organizations AS config
    JOIN public.clients AS client
      ON client.organization_id = config.organization_id
    WHERE client.archived_at IS NULL
      AND client.owner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = client.organization_id
          AND member.user_id = client.owner_id
          AND member.is_active
      )

    UNION ALL

    SELECT process.organization_id, 'process_inactive_owner'
    FROM reporting_organizations AS config
    JOIN public.processes AS process
      ON process.organization_id = config.organization_id
    WHERE process.archived_at IS NULL
      AND process.owner_id IS NOT NULL
      AND process.stage::text NOT IN (
        'deferido', 'finalizado', 'arquivado', 'cancelado'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = process.organization_id
          AND member.user_id = process.owner_id
          AND member.is_active
      )

    UNION ALL

    SELECT process.organization_id, 'process_document_counter_invalid'
    FROM reporting_organizations AS config
    JOIN public.processes AS process
      ON process.organization_id = config.organization_id
    WHERE process.archived_at IS NULL
      AND (
        process.documents_received < 0
        OR process.documents_total < 0
        OR process.documents_received > process.documents_total
      )

    UNION ALL

    SELECT thread.organization_id, 'communication_inactive_assignee'
    FROM reporting_organizations AS config
    JOIN public.communication_threads AS thread
      ON thread.organization_id = config.organization_id
    WHERE thread.archived_at IS NULL
      AND thread.assigned_to IS NOT NULL
      AND thread.status::text NOT IN ('resolvida', 'arquivada')
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = thread.organization_id
          AND member.user_id = thread.assigned_to
          AND member.is_active
      )

    UNION ALL

    SELECT thread.organization_id, 'communication_client_mismatch'
    FROM reporting_organizations AS config
    JOIN public.communication_threads AS thread
      ON thread.organization_id = config.organization_id
    JOIN public.processes AS process
      ON process.id = thread.process_id
     AND process.organization_id = thread.organization_id
    WHERE thread.archived_at IS NULL
      AND process.client_id <> thread.client_id

    UNION ALL

    SELECT document.organization_id, 'document_client_mismatch'
    FROM reporting_organizations AS config
    JOIN public.documents AS document
      ON document.organization_id = config.organization_id
    JOIN public.processes AS process
      ON process.id = document.process_id
     AND process.organization_id = document.organization_id
    WHERE document.archived_at IS NULL
      AND document.client_id IS NOT NULL
      AND process.client_id <> document.client_id

    UNION ALL

    SELECT financial.organization_id, 'financial_inactive_responsible'
    FROM reporting_organizations AS config
    JOIN public.financial_transactions AS financial
      ON financial.organization_id = config.organization_id
    WHERE financial.archived_at IS NULL
      AND financial.responsible_user_id IS NOT NULL
      AND financial.status <> 'cancelled'
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = financial.organization_id
          AND member.user_id = financial.responsible_user_id
          AND member.is_active
      )

    UNION ALL

    SELECT financial.organization_id, 'financial_client_mismatch'
    FROM reporting_organizations AS config
    JOIN public.financial_transactions AS financial
      ON financial.organization_id = config.organization_id
    JOIN public.processes AS process
      ON process.id = financial.process_id
     AND process.organization_id = financial.organization_id
    WHERE financial.archived_at IS NULL
      AND financial.client_id IS NOT NULL
      AND process.client_id <> financial.client_id
  ), summaries AS (
    SELECT
      config.organization_id,
      config.week_start,
      count(issue.issue_kind)::integer AS total_count,
      count(*) FILTER (
        WHERE issue.issue_kind = 'organization_missing_owner'
      )::integer AS organization_count,
      count(*) FILTER (
        WHERE issue.issue_kind LIKE 'task_%'
      )::integer AS task_count,
      count(*) FILTER (
        WHERE issue.issue_kind LIKE 'client_%'
      )::integer AS client_count,
      count(*) FILTER (
        WHERE issue.issue_kind LIKE 'process_%'
      )::integer AS process_count,
      count(*) FILTER (
        WHERE issue.issue_kind LIKE 'communication_%'
      )::integer AS communication_count,
      count(*) FILTER (
        WHERE issue.issue_kind LIKE 'document_%'
      )::integer AS document_count,
      count(*) FILTER (
        WHERE issue.issue_kind LIKE 'financial_%'
      )::integer AS financial_count
    FROM reporting_organizations AS config
    JOIN quality_issues AS issue
      ON issue.organization_id = config.organization_id
    GROUP BY config.organization_id, config.week_start
  ), recipients AS (
    SELECT summary.*, member.user_id
    FROM summaries AS summary
    JOIN public.organization_members AS member
      ON member.organization_id = summary.organization_id
     AND member.is_active
     AND member.role::text IN (
       'superadmin', 'proprietario', 'administrador', 'gestor'
     )
    WHERE summary.total_count > 0
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, action_url, dedupe_key
  )
  SELECT
    summary.organization_id,
    summary.user_id,
    'Qualidade dos dados: revisão necessária',
    format(
      'A verificação semanal encontrou %s %s: organização %s; tarefas %s; clientes %s; processos %s; comunicação %s; documentos %s; financeiro %s. Nenhum cadastro foi alterado automaticamente.',
      summary.total_count,
      CASE
        WHEN summary.total_count = 1 THEN 'inconsistência'
        ELSE 'inconsistências'
      END,
      summary.organization_count,
      summary.task_count,
      summary.client_count,
      summary.process_count,
      summary.communication_count,
      summary.document_count,
      summary.financial_count
    ),
    'monitoring',
    '/relatorios',
    'weekly-data-quality:' || summary.week_start::text || ':' ||
      summary.user_id::text
  FROM recipients AS summary
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
      weekly_data_quality_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_weekly_data_quality_notifications(
  timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_weekly_data_quality_notifications(
  timestamptz
) TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
