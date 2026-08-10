BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(14);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.communication_threads'::regclass), 'communication_threads has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.communication_entries'::regclass), 'communication_entries has RLS enabled');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'communication_threads' AND policyname = 'communication_threads_select'), 1::bigint, 'communication_threads_select exists exactly once');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'communication_entries' AND policyname = 'communication_entries_select'), 1::bigint, 'communication_entries_select exists exactly once');
SELECT is((SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'communication_threads' AND policyname = 'communication_threads_select'), ARRAY['authenticated']::name[], 'thread read policy is limited to authenticated');
SELECT is((SELECT roles FROM pg_policies WHERE schemaname = 'public' AND tablename = 'communication_entries' AND policyname = 'communication_entries_select'), ARRAY['authenticated']::name[], 'entry read policy is limited to authenticated');
SELECT is((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'communication_threads' AND policyname = 'communication_threads_select'), 'is_org_member(organization_id)', 'thread read policy keeps organization membership predicate');
SELECT is((SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'communication_entries' AND policyname = 'communication_entries_select'), 'is_org_member(organization_id)', 'entry read policy keeps organization membership predicate');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('communication_threads', 'communication_entries') AND cmd <> 'SELECT'), 0::bigint, 'communication tables have no direct write policies');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.communication_threads', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.communication_threads', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.communication_threads', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.communication_entries', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.communication_entries', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.communication_entries', 'DELETE'),
  'authenticated has no direct communication write privileges'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
VALUES ('10000000-0000-0000-0000-000000000010', 'communication@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations (id, legal_name) VALUES
  ('20000000-0000-0000-0000-000000000010', 'Communication Authorized Org'),
  ('20000000-0000-0000-0000-000000000011', 'Communication Other Org');
INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
  ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'operacional');
INSERT INTO public.clients (id, organization_id, name) VALUES
  ('30000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'Authorized Client'),
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 'Other Client');
INSERT INTO public.communication_threads (id, organization_id, client_id, subject, created_by) VALUES
  ('40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', '30000000-0000-0000-0000-000000000010', 'Authorized thread', '10000000-0000-0000-0000-000000000010'),
  ('40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000011', 'Other thread', '10000000-0000-0000-0000-000000000010');
INSERT INTO public.communication_entries (organization_id, thread_id, entry_type, content, created_by) VALUES
  ('20000000-0000-0000-0000-000000000010', '40000000-0000-0000-0000-000000000010', 'mensagem', 'Authorized entry', '10000000-0000-0000-0000-000000000010'),
  ('20000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000011', 'mensagem', 'Other entry', '10000000-0000-0000-0000-000000000010');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000010', true);
SELECT is((SELECT count(*) FROM public.communication_threads WHERE organization_id = '20000000-0000-0000-0000-000000000010'), 1::bigint, 'member can read an authorized organization thread');
SELECT is((SELECT count(*) FROM public.communication_entries WHERE organization_id = '20000000-0000-0000-0000-000000000010'), 1::bigint, 'member can read an authorized organization entry');
SELECT is((SELECT count(*) FROM public.communication_threads WHERE organization_id = '20000000-0000-0000-0000-000000000011'), 0::bigint, 'member cannot read another organization thread');
SELECT is((SELECT count(*) FROM public.communication_entries WHERE organization_id = '20000000-0000-0000-0000-000000000011'), 0::bigint, 'member cannot read another organization entry');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
