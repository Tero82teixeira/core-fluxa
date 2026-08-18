BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(7);

SELECT ok(
  NOT has_function_privilege('anon', 'public.process_automation_event(uuid,text,text,uuid,jsonb,uuid,integer,text)', 'EXECUTE'),
  'anon cannot execute process_automation_event'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.process_automation_event(uuid,text,text,uuid,jsonb,uuid,integer,text)', 'EXECUTE'),
  'authenticated cannot execute process_automation_event'
);
SELECT ok(
  has_function_privilege('service_role', 'public.process_automation_event(uuid,text,text,uuid,jsonb,uuid,integer,text)', 'EXECUTE'),
  'service_role can execute process_automation_event'
);
SELECT ok(
  has_function_privilege('postgres', 'public.process_automation_event(uuid,text,text,uuid,jsonb,uuid,integer,text)', 'EXECUTE'),
  'postgres can execute process_automation_event'
);

INSERT INTO auth.users(id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at) VALUES
  ('19000000-0000-0000-0000-000000000001', 'automation-engine@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29000000-0000-0000-0000-000000000001', 'Automation Engine Hardening');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'administrador', true);
INSERT INTO public.clients(id, organization_id, name) VALUES
  ('39000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Automation Client');
INSERT INTO public.processes(id, organization_id, code, client_id, title, stage) VALUES
  ('49000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'AUTO-HARDEN', '39000000-0000-0000-0000-000000000001', 'Automation Process', 'novo');
INSERT INTO public.automation_rules(organization_id, name, trigger_type, conditions, action_type, action_config, is_active, created_by) VALUES
  ('29000000-0000-0000-0000-000000000001', 'Internal trigger rule', 'process.stage_changed', '[]', 'create_task', '{"title":"Created by internal trigger"}', true, '19000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000001', true);
SELECT lives_ok(
  $$UPDATE public.processes SET stage = 'montagem' WHERE id = '49000000-0000-0000-0000-000000000001'$$,
  'authenticated update can invoke the internal SECURITY DEFINER trigger chain'
);
RESET ROLE;

SELECT is(
  (SELECT status::text FROM public.automation_executions WHERE entity_id = '49000000-0000-0000-0000-000000000001' AND event_type = 'process.stage_changed'),
  'success',
  'trigger executes process_automation_event successfully'
);
SELECT is(
  (SELECT count(*) FROM public.tasks WHERE process_id = '49000000-0000-0000-0000-000000000001' AND title = 'Created by internal trigger'),
  1::bigint,
  'trigger-driven automation creates the expected task'
);

SELECT * FROM finish();
ROLLBACK;
