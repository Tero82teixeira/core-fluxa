-- Stage 42: send one management productivity report every Monday after 08:00
-- in each active organization's timezone. The report covers the previous
-- local week, is tenant-derived and idempotent, and reuses the single clock.

CREATE OR REPLACE FUNCTION public.create_weekly_productivity_report_notifications(
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
      AND coalesce(
        settings.notification_preferences
          ->>'weekly_productivity_report',
        'true'
      ) <> 'false'
  ), reporting_organizations AS (
    SELECT
      config.organization_id,
      config.timezone_name,
      (_as_of AT TIME ZONE config.timezone_name)::date AS local_today,
      date_trunc(
        'week', _as_of AT TIME ZONE config.timezone_name
      )::date AS current_week_start
    FROM organization_timezones AS config
    WHERE extract(
      isodow FROM (_as_of AT TIME ZONE config.timezone_name)
    ) = 1
      AND (_as_of AT TIME ZONE config.timezone_name)::time >= time '08:00'
  ), task_totals AS (
    SELECT
      config.organization_id,
      config.current_week_start - 7 AS report_start,
      config.current_week_start - 1 AS report_end,
      count(task.id) FILTER (
        WHERE task.completed_at IS NOT NULL
          AND (
            task.completed_at AT TIME ZONE config.timezone_name
          )::date >= config.current_week_start - 7
          AND (
            task.completed_at AT TIME ZONE config.timezone_name
          )::date < config.current_week_start
      )::integer AS completed_tasks,
      count(task.id) FILTER (
        WHERE task.status::text IN (
          'pendente', 'em_andamento', 'aguardando'
        )
      )::integer AS pending_tasks,
      count(task.id) FILTER (
        WHERE task.status::text IN (
          'pendente', 'em_andamento', 'aguardando'
        )
          AND task.due_at IS NOT NULL
          AND (
            task.due_at AT TIME ZONE config.timezone_name
          )::date < config.local_today
      )::integer AS overdue_tasks
    FROM reporting_organizations AS config
    LEFT JOIN public.tasks AS task
      ON task.organization_id = config.organization_id
     AND task.archived_at IS NULL
     AND task.deleted_at IS NULL
    GROUP BY
      config.organization_id,
      config.current_week_start
  ), automation_totals AS (
    SELECT
      config.organization_id,
      count(execution.id)::integer AS failed_automations
    FROM reporting_organizations AS config
    LEFT JOIN public.automation_executions AS execution
      ON execution.organization_id = config.organization_id
     AND execution.status = 'failed'
     AND (
       execution.started_at AT TIME ZONE config.timezone_name
     )::date >= config.current_week_start - 7
     AND (
       execution.started_at AT TIME ZONE config.timezone_name
     )::date < config.current_week_start
    GROUP BY config.organization_id
  ), responsibility_counts AS (
    SELECT
      config.organization_id,
      task.assignee_id,
      CASE
        WHEN task.assignee_id IS NULL THEN 'Sem responsável'
        ELSE coalesce(
          nullif(trim(profile.full_name), ''),
          nullif(trim(task.assignee_name), ''),
          'Responsável sem nome'
        )
      END AS responsible_name,
      count(*)::integer AS pending_count,
      count(*) FILTER (
        WHERE task.due_at IS NOT NULL
          AND (
            task.due_at AT TIME ZONE config.timezone_name
          )::date < config.local_today
      )::integer AS overdue_count
    FROM reporting_organizations AS config
    JOIN public.tasks AS task
      ON task.organization_id = config.organization_id
     AND task.archived_at IS NULL
     AND task.deleted_at IS NULL
     AND task.status::text IN (
       'pendente', 'em_andamento', 'aguardando'
     )
    LEFT JOIN public.profiles AS profile
      ON profile.id = task.assignee_id
    GROUP BY
      config.organization_id,
      task.assignee_id,
      responsible_name
  ), ranked_responsibilities AS (
    SELECT
      responsibility.*,
      row_number() OVER (
        PARTITION BY responsibility.organization_id
        ORDER BY
          responsibility.pending_count DESC,
          responsibility.overdue_count DESC,
          responsibility.responsible_name
      ) AS position
    FROM responsibility_counts AS responsibility
  ), responsibility_summaries AS (
    SELECT
      responsibility.organization_id,
      string_agg(
        format(
          '%s: %s %s (%s %s)',
          responsibility.responsible_name,
          responsibility.pending_count,
          CASE responsibility.pending_count
            WHEN 1 THEN 'pendente'
            ELSE 'pendentes'
          END,
          responsibility.overdue_count,
          CASE responsibility.overdue_count
            WHEN 1 THEN 'atrasada'
            ELSE 'atrasadas'
          END
        ),
        '; ' ORDER BY responsibility.position
      ) AS responsibility_summary
    FROM ranked_responsibilities AS responsibility
    WHERE responsibility.position <= 5
    GROUP BY responsibility.organization_id
  ), summaries AS (
    SELECT
      task.organization_id,
      task.report_start,
      task.report_end,
      task.completed_tasks,
      task.pending_tasks,
      task.overdue_tasks,
      coalesce(automation.failed_automations, 0) AS failed_automations,
      coalesce(
        responsibility.responsibility_summary,
        'Nenhuma pendência aberta'
      ) AS responsibility_summary
    FROM task_totals AS task
    LEFT JOIN automation_totals AS automation
      ON automation.organization_id = task.organization_id
    LEFT JOIN responsibility_summaries AS responsibility
      ON responsibility.organization_id = task.organization_id
  ), recipients AS (
    SELECT summary.*, member.user_id
    FROM summaries AS summary
    JOIN public.organization_members AS member
      ON member.organization_id = summary.organization_id
     AND member.is_active
     AND member.role::text IN (
       'superadmin', 'proprietario', 'administrador', 'gestor'
     )
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, action_url, dedupe_key
  )
  SELECT
    summary.organization_id,
    summary.user_id,
    format(
      'Produtividade semanal: %s %s e %s %s',
      summary.completed_tasks,
      CASE summary.completed_tasks
        WHEN 1 THEN 'concluída'
        ELSE 'concluídas'
      END,
      summary.pending_tasks,
      CASE summary.pending_tasks
        WHEN 1 THEN 'pendente'
        ELSE 'pendentes'
      END
    ),
    format(
      'Semana de %s a %s. Tarefas concluídas: %s. Pendentes agora: %s. Atrasadas: %s. Falhas automáticas na semana: %s. Pendências por responsável: %s.',
      to_char(summary.report_start, 'DD/MM/YYYY'),
      to_char(summary.report_end, 'DD/MM/YYYY'),
      summary.completed_tasks,
      summary.pending_tasks,
      summary.overdue_tasks,
      summary.failed_automations,
      summary.responsibility_summary
    ),
    'monitoring',
    '/relatorios',
    'weekly-productivity-report:' || summary.report_start::text || ':' ||
      summary.user_id::text
  FROM recipients AS summary
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Preserve every approved temporal stage and add this report to the existing
-- cycle. No additional pg_cron job is created by this migration.
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
  stale_task_count integer := 0;
  daily_operational_close_count integer := 0;
  weekly_productivity_report_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    weekly_productivity_report_count :=
      public.create_weekly_productivity_report_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_productivity_report_count := -1;
    RAISE WARNING 'WEEKLY_PRODUCTIVITY_REPORT_FAILED: %', SQLSTATE;
  END;

  BEGIN
    daily_operational_close_count :=
      public.create_daily_operational_close_notifications();
  EXCEPTION WHEN OTHERS THEN
    daily_operational_close_count := -1;
    RAISE WARNING 'DAILY_OPERATIONAL_CLOSE_FAILED: %', SQLSTATE;
  END;

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
    'weekly_productivity_reports_created',
      weekly_productivity_report_count,
    'daily_operational_close_notifications_created',
      daily_operational_close_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_task_notifications_created', stale_task_count,
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

REVOKE ALL ON FUNCTION public.create_weekly_productivity_report_notifications(
  timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_weekly_productivity_report_notifications(
  timestamptz
) TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
