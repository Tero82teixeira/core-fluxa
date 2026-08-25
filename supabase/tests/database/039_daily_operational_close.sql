BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_daily_operational_close_notifications',
  ARRAY['timestamp with time zone'],
  'automatic daily operational close helper exists'
);
SELECT has_function(
  'public', 'create_operational_close_for_organization',
  ARRAY[
    'uuid', 'timestamp with time zone', 'text', 'text'
  ],
  'shared operational close helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_daily_operational_close_notifications(timestamptz)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_daily_operational_close_notifications(timestamptz)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_daily_operational_close_notifications(timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_daily_operational_close_notifications(timestamptz)',
    'EXECUTE'
  ),
  'automatic close is private to the trusted clock owner'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  (
    '19280000-0000-0000-0000-000000000001',
    'close-admin@fluxa.test', '{}', 'authenticated',
    'authenticated', '', now()
  ),
  (
    '19280000-0000-0000-0000-000000000002',
    'close-operator@fluxa.test', '{}', 'authenticated',
    'authenticated', '', now()
  ),
  (
    '19280000-0000-0000-0000-000000000003',
    'close-disabled@fluxa.test', '{}', 'authenticated',
    'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name) VALUES
  (
    '29280000-0000-0000-0000-000000000001',
    'Operational Close Tenant'
  ),
  (
    '29280000-0000-0000-0000-000000000002',
    'Disabled Operational Close Tenant'
  );

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29280000-0000-0000-0000-000000000001',
    '19280000-0000-0000-0000-000000000001',
    'administrador', true
  ),
  (
    '29280000-0000-0000-0000-000000000001',
    '19280000-0000-0000-0000-000000000002',
    'operacional', true
  ),
  (
    '29280000-0000-0000-0000-000000000002',
    '19280000-0000-0000-0000-000000000003',
    'administrador', true
  );

INSERT INTO public.organization_settings(
  organization_id, timezone, business_hours_end,
  notification_preferences
) VALUES
  (
    '29280000-0000-0000-0000-000000000001',
    'America/Sao_Paulo', '18:00',
    '{"daily_operational_close":true}'::jsonb
  ),
  (
    '29280000-0000-0000-0000-000000000002',
    'America/Sao_Paulo', '18:00',
    '{"daily_operational_close":false}'::jsonb
  );

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id,
  completed_at, created_by, created_at, updated_at
) VALUES
  (
    '49280000-0000-0000-0000-000000000001',
    '29280000-0000-0000-0000-000000000001',
    'Assigned overdue close task', 'pendente', 'media',
    '2026-08-24 12:00:00+00',
    '19280000-0000-0000-0000-000000000002',
    NULL,
    '19280000-0000-0000-0000-000000000001',
    '2026-08-20 12:00:00+00', '2026-08-20 12:00:00+00'
  ),
  (
    '49280000-0000-0000-0000-000000000002',
    '29280000-0000-0000-0000-000000000001',
    'Unassigned overdue close task', 'pendente', 'media',
    '2026-08-24 12:00:00+00', NULL, NULL,
    '19280000-0000-0000-0000-000000000001',
    '2026-08-20 12:00:00+00', '2026-08-20 12:00:00+00'
  ),
  (
    '49280000-0000-0000-0000-000000000003',
    '29280000-0000-0000-0000-000000000001',
    'Completed close task', 'concluida', 'media', NULL,
    '19280000-0000-0000-0000-000000000002',
    '2026-08-25 15:00:00+00',
    '19280000-0000-0000-0000-000000000001',
    '2026-08-20 12:00:00+00', '2026-08-25 15:00:00+00'
  ),
  (
    '49280000-0000-0000-0000-000000000004',
    '29280000-0000-0000-0000-000000000001',
    'Old completed close task', 'concluida', 'media', NULL,
    '19280000-0000-0000-0000-000000000002',
    '2026-08-24 15:00:00+00',
    '19280000-0000-0000-0000-000000000001',
    '2026-08-20 12:00:00+00', '2026-08-24 15:00:00+00'
  ),
  (
    '49280000-0000-0000-0000-000000000005',
    '29280000-0000-0000-0000-000000000002',
    'Disabled tenant overdue task', 'pendente', 'media',
    '2026-08-24 12:00:00+00',
    '19280000-0000-0000-0000-000000000003',
    NULL,
    '19280000-0000-0000-0000-000000000003',
    '2026-08-20 12:00:00+00', '2026-08-20 12:00:00+00'
  );

INSERT INTO public.automation_rules(
  id, organization_id, name, trigger_type, conditions,
  action_type, action_config, is_active, created_by
) VALUES (
  '39280000-0000-0000-0000-000000000001',
  '29280000-0000-0000-0000-000000000001',
  'Failed close fixture', 'task.created', '[]',
  'add_audit_log', '{"message":"fixture"}', true,
  '19280000-0000-0000-0000-000000000001'
);

INSERT INTO public.automation_executions(
  id, organization_id, automation_rule_id, dedupe_key,
  entity_type, event_type, status, error_code, error_message,
  started_at, finished_at
) VALUES (
  '69280000-0000-0000-0000-000000000001',
  '29280000-0000-0000-0000-000000000001',
  '39280000-0000-0000-0000-000000000001',
  'close-failed-fixture', 'task', 'task.created', 'failed',
  'FIXTURE_FAILED', 'Safe fixture failure',
  '2026-08-25 16:00:00+00', '2026-08-25 16:01:00+00'
);

SELECT is(
  public.create_daily_operational_close_notifications(
    '2026-08-25 20:59:00+00'
  ),
  0,
  'automatic close waits until the configured local business-hours end'
);

SELECT is(
  public.create_daily_operational_close_notifications(
    '2026-08-25 21:00:00+00'
  ),
  2,
  'automatic close creates personal and management summaries'
);

SELECT is(
  (
    SELECT title
    FROM public.notifications
    WHERE user_id = '19280000-0000-0000-0000-000000000002'
      AND dedupe_key LIKE 'operational-close:%'
  ),
  'Fechamento do dia: 1 concluído e 1 pendência',
  'operator receives only personal completed and pending counts'
);

SELECT ok(
  (
    SELECT body LIKE
      '%Vencidos: 1. Falhas automáticas: 0.%'
    FROM public.notifications
    WHERE user_id = '19280000-0000-0000-0000-000000000002'
      AND dedupe_key LIKE 'operational-close:%'
  ),
  'operator receives only the personal overdue count'
);

SELECT ok(
  (
    SELECT body LIKE
      'Concluídas: 1 tarefa; 0 processos. Pendências: 1 tarefa,%'
    FROM public.notifications
    WHERE user_id = '19280000-0000-0000-0000-000000000002'
      AND dedupe_key LIKE 'operational-close:%'
  ),
  'notification body uses correct Portuguese singular and plural forms'
);

SELECT is(
  (
    SELECT title
    FROM public.notifications
    WHERE user_id = '19280000-0000-0000-0000-000000000001'
      AND dedupe_key LIKE 'operational-close:%'
  ),
  'Fechamento do dia: 1 concluído e 2 pendências',
  'management receives consolidated organization counts'
);

SELECT ok(
  (
    SELECT body LIKE
      '%Vencidos: 2. Falhas automáticas: 1. 1 item ainda sem responsável.%'
    FROM public.notifications
    WHERE user_id = '19280000-0000-0000-0000-000000000001'
      AND dedupe_key LIKE 'operational-close:%'
  ),
  'management receives overdue, failure and unassigned totals'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE user_id = '19280000-0000-0000-0000-000000000003'
      AND dedupe_key LIKE 'operational-close:%'
  ),
  0::bigint,
  'disabled organizations receive no automatic close'
);

SELECT is(
  public.create_daily_operational_close_notifications(
    '2026-08-25 21:15:00+00'
  ),
  0,
  'same local day and recipient are idempotent'
);

INSERT INTO public.automation_rules(
  id, organization_id, name, trigger_type, conditions,
  action_type, action_config, is_active, created_by
) VALUES (
  '39280000-0000-0000-0000-000000000002',
  '29280000-0000-0000-0000-000000000001',
  'Configured daily summary', 'scheduled', '[]',
  'send_operational_summary', '{}', true,
  '19280000-0000-0000-0000-000000000001'
);

INSERT INTO public.automation_schedules(
  id, automation_rule_id, organization_id, schedule_type, run_at,
  timezone, next_execution_at, is_active
) VALUES (
  '59280000-0000-0000-0000-000000000001',
  '39280000-0000-0000-0000-000000000002',
  '29280000-0000-0000-0000-000000000001',
  'daily', '18:30', 'America/Sao_Paulo',
  '2026-08-26 21:30:00+00', true
);

SELECT is(
  public.create_daily_operational_close_notifications(
    '2026-08-26 21:00:00+00'
  ),
  0,
  'an active scheduled summary suppresses the automatic close'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'operational close creates no additional clock'
);

SELECT ok(
  pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%daily_operational_close_notifications_created%'
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
  'the temporal cycle preserves every approved stage and adds daily close'
);

SELECT * FROM finish();
ROLLBACK;
