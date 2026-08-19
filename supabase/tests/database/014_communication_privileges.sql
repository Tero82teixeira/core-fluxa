BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(59);

-- Table grants: authenticated is read-only and anon has no table surface.
SELECT ok(NOT has_table_privilege('authenticated', format('public.%I', table_name), privilege),
  format('authenticated has no %s on %s', privilege, table_name))
FROM unnest(ARRAY['communication_threads','communication_entries']) table_name
CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) privilege;

SELECT ok(has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT'),
  format('authenticated keeps SELECT on %s', table_name))
FROM unnest(ARRAY['communication_threads','communication_entries']) table_name;

SELECT ok(NOT has_table_privilege('anon', format('public.%I', table_name), privilege),
  format('anon has no %s on %s', privilege, table_name))
FROM unnest(ARRAY['communication_threads','communication_entries']) table_name
CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) privilege;

-- Internal functions stay closed to both client roles.
SELECT ok(NOT has_function_privilege(client_role, function_name, 'EXECUTE'),
  format('%s cannot execute %s', client_role, function_name))
FROM unnest(ARRAY['anon','authenticated']) client_role
CROSS JOIN unnest(ARRAY[
  'public.communication_assert_role(uuid,boolean)',
  'public.communication_validate_links()',
  'public.communication_entry_validate_scope()'
]) function_name;

-- Only authenticated can execute the six supported communication RPCs.
SELECT ok(has_function_privilege('authenticated', function_name, 'EXECUTE'),
  format('authenticated can execute %s', function_name))
FROM unnest(ARRAY[
  'public.create_communication_thread(uuid,uuid,text,public.communication_channel,uuid,public.communication_priority,uuid,uuid,text,timestamp with time zone)',
  'public.add_communication_entry(uuid,public.communication_entry_type,text,timestamp with time zone,boolean,boolean,jsonb)',
  'public.update_communication_thread(uuid,text,public.communication_channel,public.communication_priority,uuid,uuid,timestamp with time zone,boolean,boolean,boolean)',
  'public.change_communication_thread_status(uuid,public.communication_status)',
  'public.assign_communication_thread(uuid,uuid)',
  'public.archive_communication_thread(uuid)'
]) function_name;

SELECT ok(NOT has_function_privilege('anon', function_name, 'EXECUTE'),
  format('anon cannot execute %s', function_name))
FROM unnest(ARRAY[
  'public.create_communication_thread(uuid,uuid,text,public.communication_channel,uuid,public.communication_priority,uuid,uuid,text,timestamp with time zone)',
  'public.add_communication_entry(uuid,public.communication_entry_type,text,timestamp with time zone,boolean,boolean,jsonb)',
  'public.update_communication_thread(uuid,text,public.communication_channel,public.communication_priority,uuid,uuid,timestamp with time zone,boolean,boolean,boolean)',
  'public.change_communication_thread_status(uuid,public.communication_status)',
  'public.assign_communication_thread(uuid,uuid)',
  'public.archive_communication_thread(uuid)'
]) function_name;

-- The original SELECT-only RLS contract remains unchanged.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', table_name)::regclass),
  format('%s keeps RLS enabled', table_name))
FROM unnest(ARRAY['communication_threads','communication_entries']) table_name;

SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=table_name
  AND policyname=policy_name), 1::bigint, format('%s remains installed once', policy_name))
FROM (VALUES
  ('communication_threads','communication_threads_select'),
  ('communication_entries','communication_entries_select')
) policies(table_name, policy_name);

SELECT is((SELECT roles FROM pg_policies WHERE schemaname='public' AND tablename=table_name
  AND policyname=policy_name), ARRAY['authenticated']::name[], format('%s remains authenticated-only', policy_name))
FROM (VALUES
  ('communication_threads','communication_threads_select'),
  ('communication_entries','communication_entries_select')
) policies(table_name, policy_name);

SELECT is((SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename=table_name
  AND policyname=policy_name), 'is_org_member(organization_id)', format('%s keeps membership predicate', policy_name))
FROM (VALUES
  ('communication_threads','communication_threads_select'),
  ('communication_entries','communication_entries_select')
) policies(table_name, policy_name);

SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public'
  AND tablename IN ('communication_threads','communication_entries') AND cmd <> 'SELECT'),
  0::bigint, 'communication tables still have no direct write policies');

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
  ('14000000-0000-0000-0000-000000000001','member-stage14@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name) VALUES
  ('24000000-0000-0000-0000-000000000001','Communication Stage 14 A'),
  ('24000000-0000-0000-0000-000000000002','Communication Stage 14 B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
  ('24000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','operacional',true);
INSERT INTO public.clients(id,organization_id,name) VALUES
  ('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Stage 14 client A'),
  ('34000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000002','Stage 14 client B');
INSERT INTO public.communication_threads(id,organization_id,client_id,subject,created_by) VALUES
  ('44000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000001','Visible','14000000-0000-0000-0000-000000000001'),
  ('44000000-0000-0000-0000-000000000002','24000000-0000-0000-0000-000000000002','34000000-0000-0000-0000-000000000002','Hidden','14000000-0000-0000-0000-000000000001');
INSERT INTO public.communication_entries(organization_id,thread_id,entry_type,content,created_by) VALUES
  ('24000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000001','mensagem','Visible','14000000-0000-0000-0000-000000000001'),
  ('24000000-0000-0000-0000-000000000002','44000000-0000-0000-0000-000000000002','mensagem','Hidden','14000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','14000000-0000-0000-0000-000000000001',true);
SELECT is((SELECT count(*) FROM public.communication_threads WHERE organization_id='24000000-0000-0000-0000-000000000001'), 1::bigint, 'member reads own organization thread');
SELECT is((SELECT count(*) FROM public.communication_entries WHERE organization_id='24000000-0000-0000-0000-000000000001'), 1::bigint, 'member reads own organization entry');
SELECT is((SELECT count(*) FROM public.communication_threads WHERE organization_id='24000000-0000-0000-0000-000000000002'), 0::bigint, 'cross-org thread read stays blocked');
SELECT is((SELECT count(*) FROM public.communication_entries WHERE organization_id='24000000-0000-0000-0000-000000000002'), 0::bigint, 'cross-org entry read stays blocked');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
