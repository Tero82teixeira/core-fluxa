BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_table_privilege('authenticated', 'public.organization_subscriptions', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.organization_subscriptions', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.organization_subscriptions', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.organization_subscriptions', 'DELETE'),
  'authenticated clients keep read-only billing table access'
);

SELECT ok(
  (
    SELECT policy.qual LIKE '%has_org_role%'
       AND policy.qual LIKE '%proprietario%'
       AND policy.qual LIKE '%administrador%'
      FROM pg_policies AS policy
     WHERE policy.schemaname = 'public'
       AND policy.tablename = 'organization_subscriptions'
       AND policy.policyname = 'organization_subscriptions_read'
  ),
  'subscription read policy is restricted to commercial managers'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  (
    '19620000-0000-0000-0000-000000000001',
    'subscription-owner@fluxa.test', '{"full_name":"Subscription Owner"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19620000-0000-0000-0000-000000000002',
    'subscription-operator@fluxa.test', '{"full_name":"Subscription Operator"}',
    'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name) VALUES (
  '29620000-0000-0000-0000-000000000001', 'Subscription Visibility Tenant'
);

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29620000-0000-0000-0000-000000000001',
    '19620000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29620000-0000-0000-0000-000000000001',
    '19620000-0000-0000-0000-000000000002', 'operacional', true
  );

INSERT INTO public.organization_subscriptions(
  organization_id, status, billing_email, access_until, next_payment_at
) VALUES (
  '29620000-0000-0000-0000-000000000001', 'active',
  'subscription-owner@fluxa.test', now() + interval '30 days',
  now() + interval '30 days'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19620000-0000-0000-0000-000000000001', true
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.organization_subscriptions
     WHERE organization_id = '29620000-0000-0000-0000-000000000001'
  ),
  1,
  'owner can read the organization subscription'
);

SELECT set_config(
  'request.jwt.claim.sub', '19620000-0000-0000-0000-000000000002', true
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.organization_subscriptions
     WHERE organization_id = '29620000-0000-0000-0000-000000000001'
  ),
  0,
  'operational member cannot read billing details'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
