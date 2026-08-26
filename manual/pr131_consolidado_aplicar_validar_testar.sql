-- PR #131 — SQL ÚNICO: aplicar, validar e criar o teste funcional
-- Execute todo este arquivo uma única vez no Supabase SQL Editor.
-- Em caso de erro, a transação inteira é revertida.

BEGIN;

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

-- Registra a migration para que o deploy não tente reaplicá-la.
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES (
  '20260826120000',
  'weekly_productivity_report',
  ARRAY['applied by consolidated PR 131 production validation']
)
ON CONFLICT (version) DO NOTHING;

DO $validation$
BEGIN
  IF to_regprocedure(
       'public.create_weekly_productivity_report_notifications(timestamptz)'
     ) IS NULL
  THEN
    RAISE EXCEPTION 'PR131_FUNCTION_MISSING';
  END IF;

  IF EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS procedure
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         coalesce(procedure.proacl, acldefault('f', procedure.proowner))
       ) AS privilege
       WHERE procedure.oid =
         'public.create_weekly_productivity_report_notifications(timestamptz)'::regprocedure
         AND privilege.grantee = 0
         AND privilege.privilege_type = 'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.create_weekly_productivity_report_notifications(timestamptz)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.create_weekly_productivity_report_notifications(timestamptz)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'service_role',
       'public.create_weekly_productivity_report_notifications(timestamptz)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'postgres',
       'public.create_weekly_productivity_report_notifications(timestamptz)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'PR131_FUNCTION_PERMISSIONS_INVALID';
  END IF;

  IF pg_get_functiondef(
       'public.run_temporal_automation_cycle()'::regprocedure
     ) NOT LIKE '%create_weekly_productivity_report_notifications%'
     OR pg_get_functiondef(
       'public.run_temporal_automation_cycle()'::regprocedure
     ) NOT LIKE '%weekly_productivity_reports_created%'
  THEN
    RAISE EXCEPTION 'PR131_TEMPORAL_CYCLE_NOT_INTEGRATED';
  END IF;

  IF (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) <> 1 OR (
    SELECT command
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) <> 'SELECT public.run_temporal_automation_cycle();'
  THEN
    RAISE EXCEPTION 'PR131_TEMPORAL_CLOCK_CHANGED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PR131_CONFIRMED_ORGANIZATION_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND user_id = 'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
      AND is_active
      AND role::text IN (
        'superadmin', 'proprietario', 'administrador', 'gestor'
      )
  ) THEN
    RAISE EXCEPTION 'PR131_CONFIRMED_MANAGEMENT_MEMBER_NOT_FOUND';
  END IF;

  IF coalesce((
    SELECT notification_preferences ->> 'weekly_productivity_report'
    FROM public.organization_settings
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  ), 'true') = 'false'
  THEN
    RAISE EXCEPTION 'PR131_WEEKLY_REPORT_DISABLED_IN_SETTINGS';
  END IF;
END;
$validation$;

-- Remove somente uma execução anterior desta fixture para permitir repetir o SQL.
DELETE FROM public.notifications
WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND dedupe_key LIKE 'weekly-productivity-report:2026-08-17:%';

DELETE FROM public.automation_executions
WHERE id = '61311300-0000-0000-0000-000000000001'
   OR dedupe_key = 'pr131-weekly-failed-fixture';

INSERT INTO public.automation_rules(
  id, organization_id, name, description, trigger_type, conditions,
  action_type, action_config, is_active, created_by, creator_name
)
SELECT
  '81311300-0000-0000-0000-000000000001',
  member.organization_id,
  'TESTE PR 131 — Relatório semanal',
  'Regra temporária usada somente para contabilizar uma falha na semana.',
  'task.created',
  '[]'::jsonb,
  'add_audit_log',
  '{"message":"Fixture funcional consolidada da PR #131."}'::jsonb,
  true,
  member.user_id,
  coalesce(profile.full_name, 'Ronaldo Teixeira')
FROM public.organization_members AS member
LEFT JOIN public.profiles AS profile ON profile.id = member.user_id
WHERE member.organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND member.user_id = 'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    trigger_type = EXCLUDED.trigger_type,
    conditions = EXCLUDED.conditions,
    action_type = EXCLUDED.action_type,
    action_config = EXCLUDED.action_config,
    is_active = true,
    archived_at = NULL,
    updated_at = now();

INSERT INTO public.tasks(
  id, organization_id, title, description, status, priority, due_at,
  assignee_id, assignee_name, completed_at, completed_by,
  created_by, updated_by, created_at, updated_at, archived_at, deleted_at
)
SELECT
  fixture.id,
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30'::uuid,
  fixture.title,
  'Fixture funcional consolidada da PR #131.',
  fixture.status::public.task_status,
  'media'::public.priority_level,
  fixture.due_at,
  fixture.assignee_id,
  CASE
    WHEN fixture.assignee_id IS NULL THEN NULL
    ELSE coalesce(profile.full_name, 'Ronaldo Teixeira')
  END,
  fixture.completed_at,
  CASE
    WHEN fixture.completed_at IS NULL THEN NULL
    ELSE 'e975fd16-c4a0-4600-b586-b36a5b0a9d48'::uuid
  END,
  'e975fd16-c4a0-4600-b586-b36a5b0a9d48'::uuid,
  'e975fd16-c4a0-4600-b586-b36a5b0a9d48'::uuid,
  fixture.created_at,
  fixture.updated_at,
  NULL,
  NULL
FROM (
  VALUES
    (
      '41311300-0000-0000-0000-000000000001'::uuid,
      'TESTE PR 131 — Concluída',
      'concluida'::text,
      NULL::timestamptz,
      'e975fd16-c4a0-4600-b586-b36a5b0a9d48'::uuid,
      '2026-08-20 15:00:00+00'::timestamptz,
      '2026-08-18 12:00:00+00'::timestamptz,
      '2026-08-20 15:00:00+00'::timestamptz
    ),
    (
      '41311300-0000-0000-0000-000000000002'::uuid,
      'TESTE PR 131 — Pendente atribuída',
      'pendente'::text,
      '2026-08-22 12:00:00+00'::timestamptz,
      'e975fd16-c4a0-4600-b586-b36a5b0a9d48'::uuid,
      NULL::timestamptz,
      '2026-08-18 12:00:00+00'::timestamptz,
      '2026-08-18 12:00:00+00'::timestamptz
    ),
    (
      '41311300-0000-0000-0000-000000000003'::uuid,
      'TESTE PR 131 — Pendente sem responsável',
      'aguardando'::text,
      '2026-08-20 12:00:00+00'::timestamptz,
      NULL::uuid,
      NULL::timestamptz,
      '2026-08-18 12:00:00+00'::timestamptz,
      '2026-08-18 12:00:00+00'::timestamptz
    )
) AS fixture(
  id, title, status, due_at, assignee_id, completed_at, created_at, updated_at
)
LEFT JOIN public.profiles AS profile
  ON profile.id = fixture.assignee_id
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    priority = EXCLUDED.priority,
    due_at = EXCLUDED.due_at,
    assignee_id = EXCLUDED.assignee_id,
    assignee_name = EXCLUDED.assignee_name,
    completed_at = EXCLUDED.completed_at,
    completed_by = EXCLUDED.completed_by,
    updated_by = EXCLUDED.updated_by,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at,
    archived_at = NULL,
    deleted_at = NULL;

INSERT INTO public.automation_executions(
  id, organization_id, automation_rule_id, dedupe_key,
  entity_type, entity_id, event_type, status,
  input_payload, error_code, error_message,
  started_at, finished_at, created_at
)
VALUES (
  '61311300-0000-0000-0000-000000000001',
  'fdae193f-19fa-4af0-95e3-4020ae3dfa30',
  '81311300-0000-0000-0000-000000000001',
  'pr131-weekly-failed-fixture',
  'task',
  '41311300-0000-0000-0000-000000000002',
  'task.created',
  'failed',
  '{"fixture":"PR131"}'::jsonb,
  'PR131_TEST_FAILURE',
  'Falha controlada para validar o relatório semanal.',
  '2026-08-21 15:00:00+00',
  '2026-08-21 15:01:00+00',
  '2026-08-21 15:00:00+00'
);

DO $functional_test$
DECLARE
  created_count integer;
BEGIN
  created_count :=
    public.create_weekly_productivity_report_notifications(
      '2026-08-24 12:00:00+00'
    );

  IF created_count < 1 THEN
    RAISE EXCEPTION 'PR131_FUNCTIONAL_TEST_CREATED_NO_NOTIFICATIONS';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE organization_id = 'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
      AND user_id = 'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
      AND dedupe_key =
        'weekly-productivity-report:2026-08-17:e975fd16-c4a0-4600-b586-b36a5b0a9d48'
      AND title LIKE 'Produtividade semanal:%'
      AND body LIKE '%Semana de 17/08/2026 a 23/08/2026.%'
      AND body LIKE '%Falhas automáticas na semana:%'
      AND body LIKE '%Sem responsável:%'
      AND kind = 'monitoring'
      AND action_url = '/relatorios'
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PR131_EXPECTED_NOTIFICATION_NOT_FOUND';
  END IF;
END;
$functional_test$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20260826120000'
  ) AS migracao_registrada,
  to_regprocedure(
    'public.create_weekly_productivity_report_notifications(timestamptz)'
  ) IS NOT NULL AS funcao_instalada,
  NOT has_function_privilege(
    'authenticated',
    'public.create_weekly_productivity_report_notifications(timestamptz)',
    'EXECUTE'
  ) AS funcao_privada,
  notification.id AS notificacao_id,
  notification.title AS titulo,
  notification.body AS resumo,
  notification.action_url AS destino,
  notification.read_at AS lida_em,
  (
    SELECT count(*)
    FROM public.tasks
    WHERE id IN (
      '41311300-0000-0000-0000-000000000001',
      '41311300-0000-0000-0000-000000000002',
      '41311300-0000-0000-0000-000000000003'
    )
      AND archived_at IS NULL
      AND deleted_at IS NULL
  ) AS tarefas_teste,
  (
    SELECT count(*)
    FROM public.automation_executions
    WHERE id = '61311300-0000-0000-0000-000000000001'
      AND status = 'failed'
  ) AS falhas_teste,
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) AS quantidade_relogios,
  (
    SELECT command
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ) AS comando_relogio
FROM public.notifications AS notification
WHERE notification.organization_id =
      'fdae193f-19fa-4af0-95e3-4020ae3dfa30'
  AND notification.user_id =
      'e975fd16-c4a0-4600-b586-b36a5b0a9d48'
  AND notification.dedupe_key =
      'weekly-productivity-report:2026-08-17:e975fd16-c4a0-4600-b586-b36a5b0a9d48'
ORDER BY notification.created_at DESC
LIMIT 1;
