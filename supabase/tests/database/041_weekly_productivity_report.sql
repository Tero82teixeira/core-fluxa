BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_weekly_productivity_report_notifications',
  ARRAY['timestamp with time zone'],
  'weekly productivity report helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_weekly_productivity_report_notifications(timestamptz)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_weekly_productivity_report_notifications(timestamptz)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_weekly_productivity_report_notifications(timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_weekly_productivity_report_notifications(timestamptz)',
    'EXECUTE'
  ),
  'only postgres can invoke the weekly productivity report helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  (
    '19410000-0000-0000-0000-000000000001',
    'productivity-owner@fluxa.test', '{"full_name":"Owner Produtividade"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19410000-0000-0000-0000-000000000002',
    'productivity-manager@fluxa.test', '{"full_name":"Gestor Produtividade"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19410000-0000-0000-0000-000000000003',
    'productivity-ana@fluxa.test', '{"full_name":"Ana Operacional"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19410000-0000-0000-0000-000000000004',
    'productivity-bruno@fluxa.test', '{"full_name":"Bruno Operacional"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19410000-0000-0000-0000-000000000005',
    'productivity-disabled@fluxa.test', '{"full_name":"Owner Desativado"}',
    'authenticated', 'authenticated', '', now()
  );

UPDATE public.profiles
SET full_name = CASE id
  WHEN '19410000-0000-0000-0000-000000000003'
    THEN 'Ana Operacional'
  WHEN '19410000-0000-0000-0000-000000000004'
    THEN 'Bruno Operacional'
  ELSE full_name
END
WHERE id IN (
  '19410000-0000-0000-0000-000000000003',
  '19410000-0000-0000-0000-000000000004'
);

INSERT INTO public.organizations(id, legal_name) VALUES
  (
    '29410000-0000-0000-0000-000000000001',
    'Weekly Productivity Tenant'
  ),
  (
    '29410000-0000-0000-0000-000000000002',
    'Disabled Weekly Productivity Tenant'
  );

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29410000-0000-0000-0000-000000000001',
    '19410000-0000-0000-0000-000000000001',
    'proprietario', true
  ),
  (
    '29410000-0000-0000-0000-000000000001',
    '19410000-0000-0000-0000-000000000002',
    'gestor', true
  ),
  (
    '29410000-0000-0000-0000-000000000001',
    '19410000-0000-0000-0000-000000000003',
    'operacional', true
  ),
  (
    '29410000-0000-0000-0000-000000000001',
    '19410000-0000-0000-0000-000000000004',
    'operacional', true
  ),
  (
    '29410000-0000-0000-0000-000000000002',
    '19410000-0000-0000-0000-000000000005',
    'proprietario', true
  );

INSERT INTO public.organization_settings(
  organization_id, timezone, notification_preferences
) VALUES
  (
    '29410000-0000-0000-0000-000000000001',
    'America/Sao_Paulo',
    '{"weekly_productivity_report":true}'::jsonb
  ),
  (
    '29410000-0000-0000-0000-000000000002',
    'America/Sao_Paulo',
    '{"weekly_productivity_report":false}'::jsonb
  );

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id,
  completed_at, created_by, created_at, updated_at
) VALUES
  (
    '49410000-0000-0000-0000-000000000001',
    '29410000-0000-0000-0000-000000000001',
    'Completed by Ana', 'concluida', 'media', NULL,
    '19410000-0000-0000-0000-000000000003',
    '2026-08-20 15:00:00+00',
    '19410000-0000-0000-0000-000000000001',
    '2026-08-17 12:00:00+00', '2026-08-20 15:00:00+00'
  ),
  (
    '49410000-0000-0000-0000-000000000002',
    '29410000-0000-0000-0000-000000000001',
    'Completed by Bruno', 'concluida', 'media', NULL,
    '19410000-0000-0000-0000-000000000004',
    '2026-08-23 15:00:00+00',
    '19410000-0000-0000-0000-000000000001',
    '2026-08-17 12:00:00+00', '2026-08-23 15:00:00+00'
  ),
  (
    '49410000-0000-0000-0000-000000000003',
    '29410000-0000-0000-0000-000000000001',
    'Old completed task', 'concluida', 'media', NULL,
    '19410000-0000-0000-0000-000000000003',
    '2026-08-16 15:00:00+00',
    '19410000-0000-0000-0000-000000000001',
    '2026-08-10 12:00:00+00', '2026-08-16 15:00:00+00'
  ),
  (
    '49410000-0000-0000-0000-000000000004',
    '29410000-0000-0000-0000-000000000001',
    'Ana overdue', 'pendente', 'media',
    '2026-08-22 12:00:00+00',
    '19410000-0000-0000-0000-000000000003', NULL,
    '19410000-0000-0000-0000-000000000001',
    '2026-08-18 12:00:00+00', '2026-08-18 12:00:00+00'
  ),
  (
    '49410000-0000-0000-0000-000000000005',
    '29410000-0000-0000-0000-000000000001',
    'Bruno pending', 'em_andamento', 'media',
    '2026-08-30 12:00:00+00',
    '19410000-0000-0000-0000-000000000004', NULL,
    '19410000-0000-0000-0000-000000000001',
    '2026-08-18 12:00:00+00', '2026-08-18 12:00:00+00'
  ),
  (
    '49410000-0000-0000-0000-000000000006',
    '29410000-0000-0000-0000-000000000001',
    'Unassigned overdue', 'aguardando', 'media',
    '2026-08-20 12:00:00+00', NULL, NULL,
    '19410000-0000-0000-0000-000000000001',
    '2026-08-18 12:00:00+00', '2026-08-18 12:00:00+00'
  ),
  (
    '49410000-0000-0000-0000-000000000007',
    '29410000-0000-0000-0000-000000000002',
    'Disabled tenant task', 'pendente', 'media',
    '2026-08-20 12:00:00+00',
    '19410000-0000-0000-0000-000000000005', NULL,
    '19410000-0000-0000-0000-000000000005',
    '2026-08-18 12:00:00+00', '2026-08-18 12:00:00+00'
  );

INSERT INTO public.automation_rules(
  id, organization_id, name, trigger_type, conditions,
  action_type, action_config, is_active, created_by
) VALUES (
  '39410000-0000-0000-0000-000000000001',
  '29410000-0000-0000-0000-000000000001',
  'Failed weekly fixture', 'task.created', '[]',
  'add_audit_log', '{"message":"fixture"}', true,
  '19410000-0000-0000-0000-000000000001'
);

INSERT INTO public.automation_executions(
  id, organization_id, automation_rule_id, dedupe_key,
  entity_type, event_type, status, error_code, error_message,
  started_at, finished_at
) VALUES
  (
    '69410000-0000-0000-0000-000000000001',
    '29410000-0000-0000-0000-000000000001',
    '39410000-0000-0000-0000-000000000001',
    'weekly-failed-fixture', 'task', 'task.created', 'failed',
    'FIXTURE_FAILED', 'Safe fixture failure',
    '2026-08-21 16:00:00+00', '2026-08-21 16:01:00+00'
  ),
  (
    '69410000-0000-0000-0000-000000000002',
    '29410000-0000-0000-0000-000000000001',
    '39410000-0000-0000-0000-000000000001',
    'old-weekly-failed-fixture', 'task', 'task.created', 'failed',
    'OLD_FIXTURE_FAILED', 'Old safe fixture failure',
    '2026-08-14 16:00:00+00', '2026-08-14 16:01:00+00'
  );

SELECT is(
  public.create_weekly_productivity_report_notifications(
    '2026-08-23 12:00:00+00'
  ),
  0,
  'the productivity report does not run on Sunday'
);
SELECT is(
  public.create_weekly_productivity_report_notifications(
    '2026-08-24 10:59:00+00'
  ),
  0,
  'the productivity report waits until 08:00 local time'
);
SELECT is(
  public.create_weekly_productivity_report_notifications(
    '2026-08-24 12:00:00+00'
  ),
  2,
  'Monday creates one report for each active management recipient'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29410000-0000-0000-0000-000000000001'
      AND title = 'Produtividade semanal: 2 concluídas e 3 pendentes'
      AND kind = 'monitoring'
      AND action_url = '/relatorios'
      AND body LIKE '%Semana de 17/08/2026 a 23/08/2026.%'
      AND body LIKE '%Atrasadas: 2.%'
      AND body LIKE '%Falhas automáticas na semana: 1.%'
  ),
  2::bigint,
  'the report exposes the requested weekly metrics and navigation'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29410000-0000-0000-0000-000000000001'
      AND body LIKE '%Ana Operacional: 1 pendente (1 atrasada)%'
      AND body LIKE '%Bruno Operacional: 1 pendente (0 atrasadas)%'
      AND body LIKE '%Sem responsável: 1 pendente (1 atrasada)%'
  ),
  2::bigint,
  'pending work is grouped by responsible person and includes unassigned work'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29410000-0000-0000-0000-000000000001'
      AND user_id IN (
        '19410000-0000-0000-0000-000000000003',
        '19410000-0000-0000-0000-000000000004'
      )
      AND dedupe_key LIKE 'weekly-productivity-report:%'
  ),
  0::bigint,
  'operational users do not receive the management report'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29410000-0000-0000-0000-000000000002'
      AND dedupe_key LIKE 'weekly-productivity-report:%'
  ),
  0::bigint,
  'an organization can disable the weekly productivity report'
);
SELECT is(
  public.create_weekly_productivity_report_notifications(
    '2026-08-24 12:15:00+00'
  ),
  0,
  'replaying the same week does not duplicate recipient reports'
);
SELECT is(
  public.create_weekly_productivity_report_notifications(
    '2026-08-31 12:00:00+00'
  ),
  2,
  'a new week produces a new idempotency cycle'
);
SELECT is(
  (
    SELECT status::text
    FROM public.tasks
    WHERE id = '49410000-0000-0000-0000-000000000004'
  ),
  'pendente',
  'the report never changes a source task'
);
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the productivity report creates no additional clock'
);
SELECT is(
  (
    SELECT command
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  'SELECT public.run_temporal_automation_cycle();',
  'the private temporal command remains unchanged'
);
SELECT ok(
  pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%weekly_productivity_reports_created%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_weekly_productivity_report_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_daily_operational_close_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_stale_task_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_stale_lead_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_client_birthday_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_stale_client_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_weekly_data_quality_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_weekly_financial_summary_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%process_due_financial_recurrences()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_overdue_financial_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_expired_document_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_overdue_communication_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_stale_process_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_overdue_task_escalation_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_deadline_reminder_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_unassigned_monitoring_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_critical_monitoring_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%process_due_scheduled_automations()%',
  'the temporal cycle preserves every prior stage and adds productivity'
);

SELECT * FROM finish();
ROLLBACK;
