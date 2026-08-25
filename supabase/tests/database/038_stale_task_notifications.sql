BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_stale_task_notifications',
  ARRAY['timestamp with time zone'],
  'private stale-task helper exists'
);
SELECT has_column(
  'public', 'organization_settings', 'stale_task_days',
  'stale task threshold is configurable'
);
SELECT has_index(
  'public', 'tasks', 'tasks_stale_activity_idx',
  'stale task scan has a dedicated partial index'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_stale_task_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_stale_task_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_stale_task_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_stale_task_notifications(timestamp with time zone)',
    'EXECUTE'
  ),
  'only postgres can invoke the stale-task helper'
);
SELECT ok(
  pg_get_functiondef(
    'public.get_organization_settings(uuid)'::regprocedure
  ) LIKE '%stale_task_days%'
  AND pg_get_functiondef(
    'public.update_organization_settings(uuid,jsonb)'::regprocedure
  ) LIKE '%SETTINGS_STALE_TASK_DAYS_INVALID%'
  AND pg_get_functiondef(
    'public.update_organization_settings(uuid,jsonb)'::regprocedure
  ) LIKE '%stale_task_days=COALESCE%',
  'settings RPCs read, validate and persist the threshold'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('49910000-0000-0000-0000-000000000001', 'stale-task-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49910000-0000-0000-0000-000000000002', 'stale-task-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49910000-0000-0000-0000-000000000003', 'stale-task-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49910000-0000-0000-0000-000000000004', 'stale-task-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49910000-0000-0000-0000-000000000005', 'stale-task-disabled@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name) VALUES
  ('59910000-0000-0000-0000-000000000001', 'Stale Task Tenant'),
  ('59910000-0000-0000-0000-000000000002', 'Disabled Stale Task Tenant');

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('59910000-0000-0000-0000-000000000001', '49910000-0000-0000-0000-000000000001', 'proprietario', true),
  ('59910000-0000-0000-0000-000000000001', '49910000-0000-0000-0000-000000000002', 'administrador', true),
  ('59910000-0000-0000-0000-000000000001', '49910000-0000-0000-0000-000000000003', 'operacional', true),
  ('59910000-0000-0000-0000-000000000001', '49910000-0000-0000-0000-000000000004', 'operacional', true),
  ('59910000-0000-0000-0000-000000000002', '49910000-0000-0000-0000-000000000005', 'proprietario', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, stale_task_days, notification_preferences
) VALUES
  ('59910000-0000-0000-0000-000000000001', 'America/Sao_Paulo', 5, '{"stale_tasks": true}'::jsonb),
  ('59910000-0000-0000-0000-000000000002', 'America/Sao_Paulo', 5, '{"stale_tasks": false}'::jsonb);

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id,
  archived_at, completed_at, created_by, created_at, updated_at
) VALUES
  ('69910000-0000-0000-0000-000000000001', '59910000-0000-0000-0000-000000000001', 'First stale task notice', 'pendente', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000003', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-20 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000002', '59910000-0000-0000-0000-000000000001', 'Escalated stale task', 'em_andamento', 'alta', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000003', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000003', '59910000-0000-0000-0000-000000000001', 'Recent task', 'pendente', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000003', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-22 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000004', '59910000-0000-0000-0000-000000000001', 'Overdue stale task', 'pendente', 'media', '2026-08-24 00:00:00+00', '49910000-0000-0000-0000-000000000003', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000005', '59910000-0000-0000-0000-000000000001', 'Unassigned stale task', 'pendente', 'media', '2026-08-30 00:00:00+00', NULL, NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000006', '59910000-0000-0000-0000-000000000001', 'Inactive assignee task', 'pendente', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000004', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000007', '59910000-0000-0000-0000-000000000001', 'Completed task', 'concluida', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000003', NULL, '2026-08-21 12:00:00+00', '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000008', '59910000-0000-0000-0000-000000000001', 'Archived task', 'arquivada', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000003', '2026-08-21 12:00:00+00', NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000009', '59910000-0000-0000-0000-000000000002', 'Preference disabled task', 'pendente', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000005', NULL, NULL, '49910000-0000-0000-0000-000000000005', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000010', '59910000-0000-0000-0000-000000000001', 'Recent history task', 'pendente', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000003', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000011', '59910000-0000-0000-0000-000000000001', 'Recent comment task', 'pendente', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000003', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00'),
  ('69910000-0000-0000-0000-000000000012', '59910000-0000-0000-0000-000000000001', 'Owner assigned escalation', 'em_andamento', 'media', '2026-08-30 00:00:00+00', '49910000-0000-0000-0000-000000000001', NULL, NULL, '49910000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00', '2026-08-15 12:00:00+00');

INSERT INTO public.task_history(
  id, organization_id, task_id, user_id, user_name, action, created_at
) VALUES (
  '79910000-0000-0000-0000-000000000001',
  '59910000-0000-0000-0000-000000000001',
  '69910000-0000-0000-0000-000000000010',
  '49910000-0000-0000-0000-000000000003',
  'Stale Operator',
  'status_updated',
  '2026-08-24 12:00:00+00'
);

INSERT INTO public.task_comments(
  id, organization_id, task_id, user_id, user_name, comment,
  created_at, updated_at
) VALUES (
  '89910000-0000-0000-0000-000000000001',
  '59910000-0000-0000-0000-000000000001',
  '69910000-0000-0000-0000-000000000011',
  '49910000-0000-0000-0000-000000000003',
  'Stale Operator',
  'Movimentação recente',
  '2026-08-24 12:00:00+00',
  '2026-08-24 12:00:00+00'
);

UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '59910000-0000-0000-0000-000000000001'
  AND user_id = '49910000-0000-0000-0000-000000000004';

SELECT is(
  public.create_stale_task_notifications('2026-08-25 10:59:00+00'),
  0,
  'the stale-task scan does not run before 08:00 local time'
);
SELECT is(
  public.create_stale_task_notifications('2026-08-25 12:00:00+00'),
  6,
  'first and escalated stale tasks notify the approved recipients'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE entity_id = '69910000-0000-0000-0000-000000000001'
      AND user_id = '49910000-0000-0000-0000-000000000003'
      AND dedupe_key LIKE 'stale-task:%:1:%'
  ),
  1::bigint,
  'the active assignee receives the first stale-task stage'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE entity_id = '69910000-0000-0000-0000-000000000002'
      AND user_id IN (
        '49910000-0000-0000-0000-000000000001',
        '49910000-0000-0000-0000-000000000002',
        '49910000-0000-0000-0000-000000000003'
      )
      AND dedupe_key LIKE 'stale-task:%:2:%'
  ),
  3::bigint,
  'the doubled threshold reaches assignee and active management'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE entity_id = '69910000-0000-0000-0000-000000000012'
      AND user_id IN (
        '49910000-0000-0000-0000-000000000001',
        '49910000-0000-0000-0000-000000000002'
      )
      AND dedupe_key LIKE 'stale-task:%:2:%'
  ),
  2::bigint,
  'a manager who is also assignee receives escalation only once'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE entity_id IN (
      '69910000-0000-0000-0000-000000000003',
      '69910000-0000-0000-0000-000000000004',
      '69910000-0000-0000-0000-000000000005',
      '69910000-0000-0000-0000-000000000006',
      '69910000-0000-0000-0000-000000000007',
      '69910000-0000-0000-0000-000000000008',
      '69910000-0000-0000-0000-000000000009',
      '69910000-0000-0000-0000-000000000010',
      '69910000-0000-0000-0000-000000000011'
    )
      AND dedupe_key LIKE 'stale-task:%'
  ),
  0::bigint,
  'recent, overdue, unassigned, inactive, closed and disabled rows are ignored'
);
SELECT is(
  public.create_stale_task_notifications('2026-08-25 12:15:00+00'),
  0,
  'the same task activity episode and stage are idempotent'
);

UPDATE public.tasks
SET updated_at = '2026-08-21 12:00:00+00'
WHERE id = '69910000-0000-0000-0000-000000000001';

SELECT is(
  public.create_stale_task_notifications('2026-08-26 12:00:00+00'),
  1,
  'a real task update starts a new deduplicated inactivity episode'
);
SELECT is(
  (
    SELECT status::text
    FROM public.tasks
    WHERE id = '69910000-0000-0000-0000-000000000001'
  ),
  'pendente',
  'the scan never changes task status'
);
SELECT is(
  (
    SELECT due_at
    FROM public.tasks
    WHERE id = '69910000-0000-0000-0000-000000000001'
  ),
  '2026-08-30 00:00:00+00'::timestamptz,
  'the scan never changes the task deadline'
);
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the stale-task scan creates no additional clock'
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
  ) LIKE '%stale_task_notifications_created%'
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
  'the temporal cycle preserves every approved stage and adds stale tasks'
);

SELECT * FROM finish();
ROLLBACK;
