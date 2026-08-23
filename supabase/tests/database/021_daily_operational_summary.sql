BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_function(
  'public', 'create_operational_summary_notifications',
  ARRAY['uuid', 'uuid', 'timestamp with time zone'],
  'private operational summary helper exists'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'create_operational_summary_notifications'
      AND pg_get_function_identity_arguments(procedure.oid) = 'uuid, uuid, timestamp with time zone'
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon',
    'public.create_operational_summary_notifications(uuid,uuid,timestamptz)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'authenticated',
    'public.create_operational_summary_notifications(uuid,uuid,timestamptz)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role',
    'public.create_operational_summary_notifications(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  'summary helper is not client or service-role callable'
);
SELECT ok(
  has_function_privilege(
    'postgres',
    'public.create_operational_summary_notifications(uuid,uuid,timestamptz)',
    'EXECUTE'
  ),
  'only the trusted processor owner can invoke the summary helper'
);

SELECT lives_ok(
  $$SELECT public.validate_automation(
    'scheduled', '[]', 'send_operational_summary', '{}'
  )$$,
  'empty scheduled summary configuration is valid'
);
SELECT throws_ok(
  $$SELECT public.validate_automation(
    'task.created', '[]', 'send_operational_summary', '{}'
  )$$,
  'P0001', 'INVALID_OPERATIONAL_SUMMARY',
  'event rules cannot send an operational summary'
);
SELECT throws_ok(
  $$SELECT public.validate_automation(
    'scheduled', '[]', 'send_operational_summary', '{"recipient_id":"x"}'
  )$$,
  'P0001', 'INVALID_OPERATIONAL_SUMMARY',
  'summary configuration cannot inject a recipient'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19240000-0000-0000-0000-000000000001', 'summary-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19240000-0000-0000-0000-000000000002', 'summary-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19240000-0000-0000-0000-000000000003', 'summary-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19240000-0000-0000-0000-000000000004', 'summary-other@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29240000-0000-0000-0000-000000000001', 'Summary Tenant'),
  ('29240000-0000-0000-0000-000000000002', 'Other Summary Tenant');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29240000-0000-0000-0000-000000000001', '19240000-0000-0000-0000-000000000001', 'administrador', true),
  ('29240000-0000-0000-0000-000000000001', '19240000-0000-0000-0000-000000000002', 'operacional', true),
  ('29240000-0000-0000-0000-000000000001', '19240000-0000-0000-0000-000000000003', 'administrador', false),
  ('29240000-0000-0000-0000-000000000002', '19240000-0000-0000-0000-000000000004', 'administrador', true);

INSERT INTO public.organization_settings(organization_id) VALUES
  ('29240000-0000-0000-0000-000000000001'),
  ('29240000-0000-0000-0000-000000000002');

UPDATE public.organization_settings
SET notification_preferences = '{
  "overdue_tasks":true,
  "stale_processes":false,
  "overdue_communications":false,
  "overdue_accounts":false,
  "expiring_documents":false,
  "critical_monitoring":false
}'::jsonb,
    monitoring_show_financial = false,
    monitoring_show_communication = false,
    monitoring_show_documents = false
WHERE organization_id = '29240000-0000-0000-0000-000000000001';

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id, created_by
) VALUES
  ('49240000-0000-0000-0000-000000000001', '29240000-0000-0000-0000-000000000001', 'Assigned overdue', 'pendente', 'media', now() - interval '1 day', '19240000-0000-0000-0000-000000000002', '19240000-0000-0000-0000-000000000001'),
  ('49240000-0000-0000-0000-000000000002', '29240000-0000-0000-0000-000000000001', 'Unassigned overdue', 'pendente', 'media', now() - interval '2 days', NULL, '19240000-0000-0000-0000-000000000001'),
  ('49240000-0000-0000-0000-000000000003', '29240000-0000-0000-0000-000000000001', 'Resolved overdue', 'pendente', 'media', now() - interval '3 days', '19240000-0000-0000-0000-000000000002', '19240000-0000-0000-0000-000000000001'),
  ('49240000-0000-0000-0000-000000000004', '29240000-0000-0000-0000-000000000002', 'Other tenant overdue', 'pendente', 'media', now() - interval '4 days', '19240000-0000-0000-0000-000000000004', '19240000-0000-0000-0000-000000000004');

INSERT INTO public.monitoring_states(
  organization_id, source_type, source_id, alert_kind, monitoring_status
) VALUES (
  '29240000-0000-0000-0000-000000000001', 'tarefa',
  '49240000-0000-0000-0000-000000000003', 'tarefa_atrasada', 'resolvido'
);

INSERT INTO public.automation_rules(
  id, organization_id, name, trigger_type, conditions, action_type,
  action_config, is_active, created_by
) VALUES (
  '39240000-0000-0000-0000-000000000001',
  '29240000-0000-0000-0000-000000000001',
  'Daily operational summary', 'scheduled', '[]',
  'send_operational_summary', '{}', true,
  '19240000-0000-0000-0000-000000000001'
);
SELECT throws_ok(
  $$INSERT INTO public.automation_schedules(
      automation_rule_id, organization_id, schedule_type, interval_days,
      timezone, next_execution_at, is_active
    ) VALUES (
      '39240000-0000-0000-0000-000000000001',
      '29240000-0000-0000-0000-000000000001',
      'interval_days', 2, 'UTC', now(), true
    )$$,
  'P0001', 'OPERATIONAL_SUMMARY_REQUIRES_DAILY_SCHEDULE',
  'operational summaries cannot be configured as a long interval'
);
INSERT INTO public.automation_schedules(
  id, automation_rule_id, organization_id, schedule_type, run_at,
  timezone, next_execution_at, is_active
) VALUES (
  '59240000-0000-0000-0000-000000000001',
  '39240000-0000-0000-0000-000000000001',
  '29240000-0000-0000-0000-000000000001',
  'daily', '08:00', 'UTC', now() - interval '1 minute', true
);

SELECT is(
  public.process_due_scheduled_automations(now(), 100),
  1,
  'due summary rule is processed'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE organization_id = '29240000-0000-0000-0000-000000000001'
     AND dedupe_key LIKE 'operational-summary:%'),
  2::bigint,
  'one summary is sent to the responsible member and one to the admin fallback'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id = '19240000-0000-0000-0000-000000000002'
     AND title = 'Resumo diário: 1 pendência(s)'),
  1::bigint,
  'responsible member receives only their active assigned alert'
);
SELECT ok(
  (SELECT body LIKE '%1 item(ns) ainda sem responsável.%'
   FROM public.notifications
   WHERE user_id = '19240000-0000-0000-0000-000000000001'
     AND dedupe_key LIKE 'operational-summary:%'),
  'administrator receives the unassigned-alert fallback'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id IN (
     '19240000-0000-0000-0000-000000000003',
     '19240000-0000-0000-0000-000000000004'
   ) AND dedupe_key LIKE 'operational-summary:%'),
  0::bigint,
  'inactive and cross-tenant members receive nothing'
);
SELECT is(
  (SELECT (output_payload->>'notifications_created')::integer
   FROM public.automation_executions
   WHERE automation_schedule_id = '59240000-0000-0000-0000-000000000001'),
  2,
  'execution history records the number of summaries created'
);

UPDATE public.organization_settings
SET notification_preferences = '{
  "overdue_tasks":false,
  "stale_processes":false,
  "overdue_communications":false,
  "overdue_accounts":false,
  "expiring_documents":false,
  "critical_monitoring":false
}'::jsonb
WHERE organization_id = '29240000-0000-0000-0000-000000000001';
UPDATE public.automation_schedules
SET next_execution_at = now() - interval '30 seconds'
WHERE id = '59240000-0000-0000-0000-000000000001';
SELECT is(
  public.process_due_scheduled_automations(now(), 100),
  1,
  'a new daily cycle still executes when every summary preference is disabled'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE organization_id = '29240000-0000-0000-0000-000000000001'
     AND dedupe_key LIKE 'operational-summary:%'),
  2::bigint,
  'disabled preferences prevent new summary notifications'
);
SELECT is(
  (SELECT (output_payload->>'notifications_created')::integer
   FROM public.automation_executions
   WHERE automation_schedule_id = '59240000-0000-0000-0000-000000000001'
   ORDER BY scheduled_for DESC
   LIMIT 1),
  0,
  'the empty summary cycle records zero created notifications'
);

SELECT set_config(
  'test.summary_cycle',
  (SELECT last_scheduled_for::text FROM public.automation_schedules
   WHERE id = '59240000-0000-0000-0000-000000000001'),
  true
);
UPDATE public.automation_schedules
SET next_execution_at = current_setting('test.summary_cycle')::timestamptz,
    last_scheduled_for = NULL
WHERE id = '59240000-0000-0000-0000-000000000001';
SELECT is(
  public.process_due_scheduled_automations(now(), 100),
  0,
  'replayed cycle is ignored'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE organization_id = '29240000-0000-0000-0000-000000000001'
     AND dedupe_key LIKE 'operational-summary:%'),
  2::bigint,
  'replayed cycle does not duplicate summaries'
);

SELECT * FROM finish();
ROLLBACK;
