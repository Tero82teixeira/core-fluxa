BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_function_privilege(
    'authenticated', 'public.prepare_kiwify_checkout(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.prepare_kiwify_checkout(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.prepare_kiwify_checkout(uuid)', 'EXECUTE'
  ),
  'checkout preparation remains restricted to authenticated managers'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19640000-0000-0000-0000-000000000001', 'checkout-owner@fluxa.test',
    '{"full_name":"Checkout Owner"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19640000-0000-0000-0000-000000000002', 'checkout-admin@fluxa.test',
    '{"full_name":"Checkout Admin"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(
  id, legal_name, created_by, commercial_status, trial_started_at, trial_ends_at
) VALUES (
  '29640000-0000-0000-0000-000000000001', 'Safe Checkout Company',
  '19640000-0000-0000-0000-000000000001', 'trial', now(), now() + interval '14 days'
);

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  (
    '29640000-0000-0000-0000-000000000001',
    '19640000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29640000-0000-0000-0000-000000000001',
    '19640000-0000-0000-0000-000000000002', 'administrador', true
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19640000-0000-0000-0000-000000000001","email":"checkout-owner@fluxa.test","role":"authenticated"}',
  true
);
SELECT lives_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29640000-0000-0000-0000-000000000001'
  )$$,
  'owner can prepare the first checkout'
);
SELECT is(
  (
    SELECT status || ':' || billing_email
      FROM public.organization_subscriptions
     WHERE organization_id = '29640000-0000-0000-0000-000000000001'
  ),
  'pending:checkout-owner@fluxa.test',
  'first checkout is bound to the authenticated billing email'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19640000-0000-0000-0000-000000000002","email":"checkout-admin@fluxa.test","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29640000-0000-0000-0000-000000000001'
  )$$,
  '55000', 'CHECKOUT_ALREADY_IN_PROGRESS',
  'another manager cannot steal a recent pending checkout'
);
RESET ROLE;

UPDATE public.organization_subscriptions
   SET status = 'active',
       access_until = now() + interval '30 days'
 WHERE organization_id = '29640000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19640000-0000-0000-0000-000000000001","email":"checkout-owner@fluxa.test","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29640000-0000-0000-0000-000000000001'
  )$$,
  '55000', 'SUBSCRIPTION_ALREADY_ACTIVE',
  'an active subscription cannot be overwritten by a new checkout'
);
RESET ROLE;

UPDATE public.organization_subscriptions
   SET status = 'past_due',
       access_until = now() + interval '5 days'
 WHERE organization_id = '29640000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19640000-0000-0000-0000-000000000001","email":"checkout-owner@fluxa.test","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29640000-0000-0000-0000-000000000001'
  )$$,
  '55000', 'CHECKOUT_PAID_ACCESS_STILL_ACTIVE',
  'late-payment grace access cannot create a duplicate checkout'
);
RESET ROLE;

UPDATE public.organization_subscriptions
   SET status = 'canceled',
       access_until = now() + interval '2 days'
 WHERE organization_id = '29640000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19640000-0000-0000-0000-000000000001","email":"checkout-owner@fluxa.test","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29640000-0000-0000-0000-000000000001'
  )$$,
  '55000', 'CHECKOUT_PAID_ACCESS_STILL_ACTIVE',
  'canceled renewal cannot charge again before paid access ends'
);
RESET ROLE;

UPDATE public.organization_subscriptions
   SET access_until = now() - interval '1 minute'
 WHERE organization_id = '29640000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19640000-0000-0000-0000-000000000001","email":"checkout-owner@fluxa.test","role":"authenticated"}',
  true
);
SELECT lives_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29640000-0000-0000-0000-000000000001'
  )$$,
  'checkout can restart after paid access has ended'
);
SELECT is(
  (
    SELECT status
      FROM public.organization_subscriptions
     WHERE organization_id = '29640000-0000-0000-0000-000000000001'
  ),
  'pending',
  'an eligible checkout restart returns the subscription to pending'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE organization_id = '29640000-0000-0000-0000-000000000001'
       AND action = 'billing.checkout_started'
  ),
  2,
  'only successful checkout starts are audited'
);

SELECT * FROM finish();
ROLLBACK;
