BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

INSERT INTO public.organizations (id, legal_name) VALUES
  ('81000000-0000-0000-0000-000000000001', 'RLS organization A'),
  ('81000000-0000-0000-0000-000000000002', 'RLS organization B');
INSERT INTO public.profiles (id, full_name) VALUES
  ('82000000-0000-0000-0000-000000000001', 'RLS member A'),
  ('82000000-0000-0000-0000-000000000002', 'RLS member B');
INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'operacional'),
  ('81000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000002', 'operacional');
INSERT INTO public.clients (id, organization_id, name) VALUES
  ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'Client A'),
  ('83000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'Client B');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000001', true);
SELECT is((SELECT count(*) FROM public.organizations), 1::bigint, 'member sees only its organization');
SELECT is((SELECT count(*) FROM public.clients), 1::bigint, 'member sees only clients in its organization');
SELECT ok(EXISTS(SELECT 1 FROM public.clients WHERE name = 'Client A'), 'member sees its own client');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.clients WHERE name = 'Client B'), 'member cannot see another organization client');
SELECT is((SELECT count(*) FROM public.organization_members), 1::bigint, 'memberships are isolated by organization');
SELECT ok(public.is_org_member('81000000-0000-0000-0000-000000000001'), 'membership helper accepts own organization');
SELECT ok(NOT public.is_org_member('81000000-0000-0000-0000-000000000002'), 'membership helper rejects foreign organization');
SELECT lives_ok($$INSERT INTO public.clients (organization_id, name) VALUES ('81000000-0000-0000-0000-000000000001', 'Allowed')$$, 'member can insert into own organization');
SELECT throws_ok($$INSERT INTO public.clients (organization_id, name) VALUES ('81000000-0000-0000-0000-000000000002', 'Denied')$$, '42501', 'new row violates row-level security policy for table "clients"', 'member cannot insert into another organization');
SELECT is((SELECT count(*) FROM public.clients), 2::bigint, 'rejected insert does not leak or create a row');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
