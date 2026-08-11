BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organizations'::regclass), 'organizations has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organization_members'::regclass), 'organization_members has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.clients'::regclass), 'clients has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.processes'::regclass), 'processes has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tasks'::regclass), 'tasks has RLS enabled');

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
VALUES ('10000000-0000-0000-0000-000000000100', 'rls@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations (id, legal_name) VALUES
  ('20000000-0000-0000-0000-000000000100', 'RLS Member Org'),
  ('20000000-0000-0000-0000-000000000101', 'RLS Foreign Org');
INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES ('20000000-0000-0000-0000-000000000100', '10000000-0000-0000-0000-000000000100', 'operacional');
INSERT INTO public.clients (id, organization_id, name) VALUES
  ('30000000-0000-0000-0000-000000000100', '20000000-0000-0000-0000-000000000100', 'Visible client'),
  ('30000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000101', 'Hidden client');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000100', true);
SELECT is((SELECT count(*) FROM public.organizations), 1::bigint, 'member sees only their organization');
SELECT is((SELECT count(*) FROM public.clients), 1::bigint, 'member sees only clients in their organization');
SELECT is((SELECT name FROM public.clients), 'Visible client', 'cross-organization client is not exposed');
SELECT is((SELECT count(*) FROM public.clients WHERE organization_id = '20000000-0000-0000-0000-000000000101'), 0::bigint, 'foreign organization cannot be selected explicitly');
SELECT throws_ok(
  $$INSERT INTO public.clients (organization_id, name) VALUES ('20000000-0000-0000-0000-000000000101', 'Forbidden')$$,
  '42501',
  'new row violates row-level security policy for table "clients"',
  'member cannot insert into another organization'
);
SELECT is((SELECT count(*) FROM public.organization_members WHERE organization_id = '20000000-0000-0000-0000-000000000101'), 0::bigint, 'foreign memberships stay isolated');
SELECT ok(public.is_org_member('20000000-0000-0000-0000-000000000100'), 'is_org_member accepts own organization');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
