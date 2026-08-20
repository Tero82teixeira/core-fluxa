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
  ('19210000-0000-0000-0000-000000000002', 'scheduled-b@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19210000-0000-0000-0000-000000000003', 'scheduled-fixed@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29210000-0000-0000-0000-000000000001', 'Scheduled A'),
  ('29210000-0000-0000-0000-000000000002', 'Scheduled B');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29210000-0000-0000-0000-000000000001', '19210000-0000-0000-0000-000000000001', 'administrador', true),
  ('29210000-0000-0000-0000-000000000002', '19210000-0000-0000-0000-000000000002', 'administrador', true),
  ('29210000-0000-0000-0000-000000000001', '19210000-0000-0000-0000-000000000003', 'operacional', true);

INSERT INTO public.automation_rules(
  id, organization_id, name, trigger_type, conditions, action_type, action_config,
  is_active, created_by
) VALUES
  ('39210000-0000-0000-0000-000000000001', '29210000-0000-0000-0000-000000000001', 'Unassigned', 'scheduled', '[]', 'create_task', '{"title":"Scheduled unassigned","assignee_mode":"unassigned"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000002', '29210000-0000-0000-0000-000000000001', 'Future', 'scheduled', '[]', 'create_task', '{"title":"Too soon"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000003', '29210000-0000-0000-0000-000000000001', 'Inactive schedule', 'scheduled', '[]', 'create_task', '{"title":"Inactive schedule"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000004', '29210000-0000-0000-0000-000000000001', 'Inactive rule', 'scheduled', '[]', 'create_task', '{"title":"Inactive rule"}', false, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000005', '29210000-0000-0000-0000-000000000001', 'Failure', 'scheduled', '[]', 'create_notification', '{"title":"Invalid recipient","recipient_id":"19210000-0000-0000-0000-000000000099"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000006', '29210000-0000-0000-0000-000000000002', 'Other tenant', 'scheduled', '[]', 'add_audit_log', '{"message":"other tenant cycle"}', true, '19210000-0000-0000-0000-000000000002'),
  ('39210000-0000-0000-0000-000000000007', '29210000-0000-0000-0000-000000000001', 'Fixed user', 'scheduled', '[]', 'create_task', '{"title":"Scheduled fixed","assignee_mode":"fixed_user","assignee_id":"19210000-0000-0000-0000-000000000003"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000008', '29210000-0000-0000-0000-000000000001', 'Rule creator', 'scheduled', '[]', 'create_task', '{"title":"Scheduled creator","assignee_mode":"rule_creator"}', true, '19210000-0000-0000-0000-000000000001'),
  ('39210000-0000-0000-0000-000000000009', '29210000-0000-0000-0000-000000000001', 'Cross tenant fixed user', 'scheduled', '[]', 'create_task', '{"title":"Cross tenant fixed","assignee_mode":"fixed_user","assignee_id":"19210000-0000-0000-0000-000000000002"}', true, '19210000-0000-0000-0000-000000000001');

INSERT INTO public.automation_schedules(
  id, automation_rule_id, organization_id, schedule_type, interval_days,
  timezone, next_execution_at, is_active
) VALUES
  ('49210000-0000-0000-0000-000000000001', '39210000-0000-0000-0000-000000000001', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000002', '39210000-0000-0000-0000-000000000002', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-21 09:00+00', true),
  ('49210000-0000-0000-0000-000000000003', '39210000-0000-0000-0000-000000000003', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', false),
  ('49210000-0000-0000-0000-000000000004', '39210000-0000-0000-0000-000000000004', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000005', '39210000-0000-0000-0000-000000000005', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000006', '39210000-0000-0000-0000-000000000006', '29210000-0000-0000-0000-000000000002', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000007', '39210000-0000-0000-0000-000000000007', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000008', '39210000-0000-0000-0000-000000000008', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true),
  ('49210000-0000-0000-0000-000000000009', '39210000-0000-0000-0000-000000000009', '29210000-0000-0000-0000-000000000001', 'interval_days', 1, 'UTC', '2026-08-20 09:00+00', true);

SELECT throws_ok(
  $$SELECT public.validate_automation('scheduled','[]','create_task','{"title":"Unsupported","assignee_mode":"process_owner"}')$$,
  'P0001', 'INVALID_SCHEDULED_CREATE_TASK_CONFIG', 'scheduled create_task rejects process_owner'
);

SELECT throws_ok(
  $$UPDATE public.automation_schedules SET organization_id = '29210000-0000-0000-0000-000000000002' WHERE id = '49210000-0000-0000-0000-000000000002'$$,
  'P0001', 'SCHEDULE_REQUIRES_SCHEDULED_RULE', 'cross-tenant substitution is rejected'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19210000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT count(*) FROM public.automation_schedules), 8::bigint,
  'RLS exposes only schedules from the active organization'
);
RESET ROLE;

SELECT is(
  public.process_due_scheduled_automations('2026-08-20 10:00+00', 100), 4,
  'due valid rules execute while failing rules are isolated'
);
SELECT is(
  (SELECT assignee_id FROM public.tasks WHERE title = 'Scheduled unassigned'), NULL::uuid,
  'scheduled create_task supports an unassigned task'
);
SELECT is(
  (SELECT assignee_id FROM public.tasks WHERE title = 'Scheduled fixed'),
  '19210000-0000-0000-0000-000000000003'::uuid,
  'scheduled create_task assigns an active fixed user'
);
SELECT is(
  (SELECT assignee_id FROM public.tasks WHERE title = 'Scheduled creator'),
  '19210000-0000-0000-0000-000000000001'::uuid,
  'scheduled create_task assigns the rule creator'
);
SELECT is(
  (SELECT count(*) FROM public.tasks WHERE title = 'Cross tenant fixed'), 0::bigint,
  'scheduled create_task rejects a fixed user from another organization during execution'
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
  'failed', 'allowed notification action records its execution-time failure'
);
SELECT is(
  (SELECT status FROM public.automation_executions WHERE automation_schedule_id = '49210000-0000-0000-0000-000000000009'),
  'failed', 'cross-organization fixed assignee failure is recorded'
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
  6::bigint, 'one history row exists for each attempted due rule'
);

SELECT * FROM finish();
ROLLBACK;
