BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(8);

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'rls-member-a@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('11000000-0000-0000-0000-000000000002', 'rls-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('11000000-0000-0000-0000-000000000003', 'rls-no-membership@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations (id, legal_name, trade_name)
VALUES
  ('21000000-0000-0000-0000-000000000001', 'RLS Organization A Ltda', 'RLS Organization A'),
  ('21000000-0000-0000-0000-000000000002', 'RLS Organization B Ltda', 'RLS Organization B');

INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
VALUES
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'operacional', true),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'operacional', false);

SELECT ok(
  NOT has_function_privilege('anon', 'public.is_org_member(uuid)', 'EXECUTE'),
  'anon cannot execute is_org_member directly'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT count(*) FROM public.organizations WHERE id = '21000000-0000-0000-0000-000000000001'),
  1::bigint,
  'an active member can read its own organization through RLS'
);
SELECT is(
  (SELECT count(*) FROM public.organizations WHERE id = '21000000-0000-0000-0000-000000000002'),
  0::bigint,
  'an active member cannot read another organization through RLS'
);
SELECT is(
  (SELECT count(*) FROM public.organizations),
  1::bigint,
  'organization SELECT exposes only the active member organization'
);

SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*) FROM public.organizations),
  0::bigint,
  'an inactive member cannot read its organization'
);

SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
SELECT is(
  (SELECT count(*) FROM public.organizations),
  0::bigint,
  'an authenticated user without membership cannot read organizations'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.organizations$$,
  '42501',
  'permission denied for table organizations',
  'anon cannot select from the protected organizations table'
);
SELECT throws_ok(
  $$SELECT public.is_org_member('21000000-0000-0000-0000-000000000001'::uuid)$$,
  '42501',
  'permission denied for function is_org_member',
  'anon cannot bypass RLS by calling is_org_member directly'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
