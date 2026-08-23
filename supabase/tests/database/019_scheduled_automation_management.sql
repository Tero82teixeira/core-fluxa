BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_function(
  'public', 'create_scheduled_automation',
  ARRAY['uuid','text','text','text','jsonb','text','integer',
        'time without time zone','text','timestamp with time zone','boolean'],
  'atomic scheduled automation creator exists'
);
SELECT has_function(
  'public', 'update_scheduled_automation',
  ARRAY['uuid','text','text','text','jsonb','text','integer',
        'time without time zone','text','timestamp with time zone','boolean'],
  'atomic scheduled automation updater exists'
);
SELECT has_function(
  'public', 'set_scheduled_automation_active', ARRAY['uuid','boolean'],
  'scheduled active-state RPC exists'
);
SELECT has_function(
  'public', 'archive_scheduled_automation', ARRAY['uuid'],
  'scheduled archive RPC exists'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_scheduled_automation(uuid,text,text,text,jsonb,text,integer,time without time zone,text,timestamptz,boolean)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon',
    'public.create_scheduled_automation(uuid,text,text,text,jsonb,text,integer,time without time zone,text,timestamptz,boolean)',
    'EXECUTE'
  ),
  'only authenticated users can enter the scheduled management RPC'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'create_scheduled_automation', 'update_scheduled_automation',
        'set_scheduled_automation_active', 'archive_scheduled_automation'
      )
      AND grantee = 'PUBLIC'
  ),
  'scheduled management RPCs are not executable by PUBLIC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19220000-0000-0000-0000-000000000001', 'schedule-manager-a@fluxa.test', '{"full_name":"Manager A"}', 'authenticated', 'authenticated', '', now()),
  ('19220000-0000-0000-0000-000000000002', 'schedule-manager-b@fluxa.test', '{"full_name":"Manager B"}', 'authenticated', 'authenticated', '', now()),
  ('19220000-0000-0000-0000-000000000003', 'schedule-operator@fluxa.test', '{"full_name":"Operator"}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29220000-0000-0000-0000-000000000001', 'Schedule Management A'),
  ('29220000-0000-0000-0000-000000000002', 'Schedule Management B');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29220000-0000-0000-0000-000000000001', '19220000-0000-0000-0000-000000000001', 'administrador', true),
  ('29220000-0000-0000-0000-000000000002', '19220000-0000-0000-0000-000000000002', 'administrador', true),
  ('29220000-0000-0000-0000-000000000001', '19220000-0000-0000-0000-000000000003', 'operacional', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19220000-0000-0000-0000-000000000001', true);

SELECT lives_ok(
  $$SELECT public.create_scheduled_automation(
    '29220000-0000-0000-0000-000000000001', 'Managed daily', 'Daily audit',
    'add_audit_log', '{"message":"daily cycle"}', 'daily', NULL, '09:30',
    'America/Sao_Paulo', now() + interval '1 day', true
  )$$,
  'manager atomically creates a scheduled rule and schedule'
);
SELECT is(
  (SELECT count(*) FROM public.automation_rules
   WHERE organization_id = '29220000-0000-0000-0000-000000000001'
     AND name = 'Managed daily' AND trigger_type = 'scheduled'),
  1::bigint,
  'scheduled rule is created'
);
SELECT is(
  (SELECT count(*)
   FROM public.automation_schedules AS schedule
   JOIN public.automation_rules AS rule ON rule.id = schedule.automation_rule_id
   WHERE rule.name = 'Managed daily'
     AND schedule.organization_id = '29220000-0000-0000-0000-000000000001'
     AND schedule.schedule_type = 'daily'
     AND schedule.run_at = '09:30'),
  1::bigint,
  'matching schedule is created in the same tenant'
);
SELECT set_config(
  'test.schedule_rule_id',
  (SELECT id::text FROM public.automation_rules WHERE name = 'Managed daily'),
  true
);

SELECT throws_ok(
  $$SELECT public.create_scheduled_automation(
    '29220000-0000-0000-0000-000000000001', 'Atomic invalid', NULL,
    'add_audit_log', '{"message":"invalid timezone"}', 'daily', NULL, '10:00',
    'Invalid/Timezone', now() + interval '1 day', true
  )$$,
  'P0001', 'INVALID_TIMEZONE',
  'invalid schedule rolls the whole atomic creator back'
);
SELECT is(
  (SELECT count(*) FROM public.automation_rules WHERE name = 'Atomic invalid'),
  0::bigint,
  'failed schedule creation leaves no orphan rule'
);
SELECT throws_ok(
  $$SELECT public.create_scheduled_automation(
    '29220000-0000-0000-0000-000000000001', 'Past schedule', NULL,
    'add_audit_log', '{"message":"past"}', 'daily', NULL, '10:00', 'UTC',
    now() - interval '1 minute', true
  )$$,
  'P0001', 'INVALID_NEXT_EXECUTION_AT',
  'first execution must be in the future'
);
SELECT throws_ok(
  $$SELECT public.create_automation_rule(
    '29220000-0000-0000-0000-000000000001', 'Orphan', NULL, 'scheduled', '[]',
    'add_audit_log', '{"message":"orphan"}', true
  )$$,
  'P0001', 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC',
  'generic creator cannot leave a scheduled rule without a schedule'
);

SELECT lives_ok(
  $$SELECT public.update_scheduled_automation(
    current_setting('test.schedule_rule_id')::uuid,
    'Managed interval', 'Every two days', 'add_audit_log',
    '{"message":"interval cycle"}', 'interval_days', 2, NULL, 'UTC',
    now() + interval '2 days', true
  )$$,
  'manager atomically updates rule and schedule'
);
SELECT is(
  (SELECT schedule.interval_days
   FROM public.automation_schedules AS schedule
   JOIN public.automation_rules AS rule ON rule.id = schedule.automation_rule_id
   WHERE rule.name = 'Managed interval'),
  2,
  'schedule update stays paired with the renamed rule'
);
SELECT throws_ok(
  $$SELECT public.update_automation_rule(
    current_setting('test.schedule_rule_id')::uuid,
    'Bypass', NULL, 'task.created', '[]', 'add_audit_log', '{"message":"x"}', true
  )$$,
  'P0001', 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC',
  'generic updater cannot bypass scheduled invariants'
);
SELECT throws_ok(
  $$SELECT public.duplicate_automation_rule(
    current_setting('test.schedule_rule_id')::uuid
  )$$,
  'P0001', 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC',
  'generic duplicate cannot create an orphan scheduled rule'
);
SELECT throws_ok(
  $$SELECT public.set_automation_rule_active(
    current_setting('test.schedule_rule_id')::uuid, false
  )$$,
  'P0001', 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC',
  'generic active-state RPC cannot desynchronize a scheduled rule'
);
SELECT throws_ok(
  $$SELECT public.archive_automation_rule(
    current_setting('test.schedule_rule_id')::uuid
  )$$,
  'P0001', 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC',
  'generic archive RPC cannot desynchronize a scheduled rule'
);

SELECT lives_ok(
  $$SELECT public.set_scheduled_automation_active(
    current_setting('test.schedule_rule_id')::uuid, false
  )$$,
  'dedicated active-state RPC succeeds'
);
SELECT ok(
  NOT (SELECT rule.is_active FROM public.automation_rules AS rule
       WHERE rule.name = 'Managed interval')
  AND NOT (SELECT schedule.is_active
           FROM public.automation_schedules AS schedule
           JOIN public.automation_rules AS rule ON rule.id = schedule.automation_rule_id
           WHERE rule.name = 'Managed interval'),
  'rule and schedule active states remain synchronized'
);

SELECT set_config('request.jwt.claim.sub', '19220000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.update_scheduled_automation(
    current_setting('test.schedule_rule_id')::uuid,
    'Cross tenant', NULL, 'add_audit_log', '{"message":"cross"}',
    'interval_days', 1, NULL, 'UTC', now() + interval '1 day', true
  )$$,
  'P0001', 'NOT_ALLOWED',
  'manager from another tenant cannot update the schedule'
);
SELECT set_config('request.jwt.claim.sub', '19220000-0000-0000-0000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.create_scheduled_automation(
    '29220000-0000-0000-0000-000000000001', 'Operator denied', NULL,
    'add_audit_log', '{"message":"denied"}', 'interval_days', 1, NULL, 'UTC',
    now() + interval '1 day', true
  )$$,
  'P0001', 'NOT_ALLOWED',
  'operational member cannot manage scheduled automations'
);

SELECT set_config('request.jwt.claim.sub', '19220000-0000-0000-0000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.archive_scheduled_automation(
    current_setting('test.schedule_rule_id')::uuid
  )$$,
  'dedicated archive succeeds'
);
SELECT ok(
  (SELECT rule.archived_at IS NOT NULL AND NOT rule.is_active
   FROM public.automation_rules AS rule WHERE rule.name = 'Managed interval')
  AND NOT (SELECT schedule.is_active
           FROM public.automation_schedules AS schedule
           JOIN public.automation_rules AS rule ON rule.id = schedule.automation_rule_id
           WHERE rule.name = 'Managed interval'),
  'archiving disables both the rule and its schedule'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
