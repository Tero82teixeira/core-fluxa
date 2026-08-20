BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public', 'automation_schedules', 'schedule control table exists');
SELECT has_column('public', 'automation_schedules', 'timezone', 'schedule stores timezone');
SELECT has_column('public', 'automation_schedules', 'next_execution_at', 'schedule stores next run');
SELECT has_column('public', 'automation_executions', 'scheduled_for', 'execution stores its cycle');
SELECT has_function(
  'public', 'process_due_scheduled_automations', ARRAY['timestamp with time zone', 'integer'],
  'due processor exists'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'process_due_scheduled_automations'
      AND grantee = 'PUBLIC' AND privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute processor'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.process_due_scheduled_automations(timestamptz,integer)', 'EXECUTE'),
  'anon cannot execute processor'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.process_due_scheduled_automations(timestamptz,integer)', 'EXECUTE'),
  'authenticated cannot execute processor'
);
SELECT ok(
  has_function_privilege('service_role', 'public.process_due_scheduled_automations(timestamptz,integer)', 'EXECUTE'),
  'service_role can execute processor'
);

INSERT INTO auth.users(id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at) VALUES
  ('19210000-0000-0000-0000-000000000001', 'scheduled-a@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19210000-0000-0000-0000-000000000002', 'scheduled-b@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29210000-0000-0000-0000-000000000001', 'Scheduled A'),
  ('29210000-0000-0000-0000-000000000002', 'Scheduled B');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29210000-0000-0000-0000-000000000001', '19210000-0000-0000-0000-000000000001', 'administrador', true),
  ('29210000-0000-0000-0000-000000000002', '19210000-0000-0000-0000-000000000002', 'administrador', true);

INSERT INTO public.automation_rules(
  id, organization_id, name, trigger_type, conditions, action_type, action_config,
  is_active, created_by
) VALUES
  ('39210000-0000-0000-0000-000000000001', '29210000-0000-0000-0000-000000000001', 'Due', 'scheduled', '[]', 'create_task', '{"title":"Scheduled once"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000002', '29210000-0000-0000-0000-000000000001', 'Future', 'scheduled', '[]', 'create_task', '{"title":"Too soon"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000003', '29210000-0000-0000-0000-000000000001', 'Inactive schedule', 'scheduled', '[]', 'create_task', '{"title":"Inactive schedule"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000004', '29210000-0000-0000-0000-000000000001', 'Inactive rule', 'scheduled', '[]', 'create_task', '{"title":"Inactive rule"}', false, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000005', '29210000-0000-0000-0000-000000000001', 'Failure', 'scheduled', '[]', 'update_task_status', '{"status":"concluida"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000006', '29210000-0000-0000-0000-000000000002', 'Other tenant', 'scheduled', '[]', 'add_audit_log', '{"message":"other tenant cycle"}', true, '19210000-0000-0000-0000-000000000002');

INSERT INTO public.automation_schedules(
  id, automation_rule_id, organization_id, schedule_type, interval_days,
  timezone, next_execution_at, is_active
) VALUES
  ('49210000-0000-0000-0000-000000000001', '39210000-0000-0000-0000-000000000001', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000002', '39210000-0000-0000-0000-000000000002', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-21 09:00+00', true),
  ('49210000-0000-0000-0000-000000000003', '39210000-0000-0000-0000-000000000003', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', false),
  ('49210000-0000-0000-0000-000000000004', '39210000-0000-0000-0000-000000000004', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000005', '39210000-0000-0000-0000-000000000005', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000006', '39210000-0000-0000-0000-000000000006', '29210000-0000-0000-0000-000000000002', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true);

SELECT throws_ok(
  $$UPDATE public.automation_schedules SET organization_id = '29210000-0000-0000-0000-000000000002' WHERE id = '49210000-0000-0000-0000-000000000002'$$,
  'P0001', 'SCHEDULE_REQUIRES_SCHEDULED_RULE', 'cross-tenant substitution is rejected'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19210000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT count(*) FROM public.automation_schedules), 5::bigint,
  'RLS exposes only schedules from the active organization'
);
RESET ROLE;

SELECT is(
  public.process_due_scheduled_automations('2026-08-20 10:00+00', 100), 2,
  'due valid rules execute while one failing rule is isolated'
);
SELECT is(
  (SELECT count(*) FROM public.tasks WHERE title = 'Scheduled once'), 1::bigint,
  'due rule executes once'
);
SELECT is(
  (SELECT count(*) FROM public.tasks WHERE title = 'Too soon'), 0::bigint,
  'future rule does not execute early'
);
SELECT is(
  (SELECT count(*) FROM public.tasks WHERE title IN ('Inactive schedule', 'Inactive rule')), 0::bigint,
  'inactive schedule and inactive rule do not execute'
);
SELECT is(
  (SELECT status FROM public.automation_executions WHERE automation_schedule_id = '49210000-0000-0000-0000-000000000005'),
  'failed', 'failure is recorded'
);
SELECT is(
  (SELECT organization_id FROM public.automation_executions WHERE automation_schedule_id = '49210000-0000-0000-0000-000000000006'),
  '29210000-0000-0000-0000-000000000002'::uuid, 'execution keeps schedule tenant scope'
);
SELECT is(
  (SELECT scheduled_for FROM public.automation_executions WHERE automation_schedule_id = '49210000-0000-0000-0000-000000000001'),
  '2026-08-20 09:00+00'::timestamptz, 'execution records the scheduled cycle time'
);
SELECT is(
  public.process_due_scheduled_automations('2026-08-20 10:00+00', 100), 0,
  'second call does not duplicate the same cycle'
);
SELECT is(
  (SELECT count(*) FROM public.automation_executions WHERE scheduled_for = '2026-08-20 09:00+00'),
  3::bigint, 'one history row exists for each attempted due rule'
);

SELECT * FROM finish();
ROLLBACK;
