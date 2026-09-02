BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

-- Happy path exercised as one continuous customer journey: confirmed account,
-- trial, mandatory onboarding, checkout preparation and Kiwify approval.
INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES (
  '19680000-0000-0000-0000-000000000001',
  'commercial-journey@fluxa.test',
  '{"full_name":"Commercial Journey Owner"}',
  'authenticated', 'authenticated', '', now()
);

INSERT INTO public.organizations(id, legal_name, created_by) VALUES (
  '29680000-0000-0000-0000-000000000001',
  'Commercial Journey Company',
  '19680000-0000-0000-0000-000000000001'
);

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES (
  '29680000-0000-0000-0000-000000000001',
  '19680000-0000-0000-0000-000000000001',
  'proprietario', true
);

INSERT INTO public.organization_settings(organization_id) VALUES (
  '29680000-0000-0000-0000-000000000001'
) ON CONFLICT (organization_id) DO NOTHING;

SELECT ok(
  (
    SELECT commercial_status = 'trial'
       AND trial_started_at IS NOT NULL
       AND trial_ends_at BETWEEN
         now() + interval '13 days 23 hours'
         AND now() + interval '14 days 1 minute'
       AND NOT onboarding_completed
      FROM public.organizations
     WHERE id = '29680000-0000-0000-0000-000000000001'
  ),
  'a confirmed new company starts a fourteen-day trial before onboarding'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19680000-0000-0000-0000-000000000001","email":"commercial-journey@fluxa.test","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29680000-0000-0000-0000-000000000001', 1,
    '{"trade_name":"Journey FLUXA","document":"32.955.277/0001-74","phone":"28999410465","whatsapp":"28999410465"}'::jsonb,
    NULL, false
  )$$,
  'owner completes the company onboarding step'
);
SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29680000-0000-0000-0000-000000000001', 2, NULL,
    '{"city":"Anchieta","state":"ES"}'::jsonb, false
  )$$,
  'owner completes the location onboarding step'
);
SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29680000-0000-0000-0000-000000000001', 3, NULL,
    '{"main_services":"Gestão empresarial","clients_range":"1-10","employees_range":"1-5"}'::jsonb,
    false
  )$$,
  'owner completes the operation onboarding step'
);
SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29680000-0000-0000-0000-000000000001', 3, NULL, NULL, true
  )$$,
  'owner confirms onboarding before entering the operation'
);

SELECT ok(
  public.is_org_member('29680000-0000-0000-0000-000000000001'),
  'completed onboarding keeps operational access during the trial'
);

SELECT lives_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29680000-0000-0000-0000-000000000001'
  )$$,
  'owner prepares the Kiwify checkout using the authenticated email'
);
RESET ROLE;

SELECT ok(
  (
    SELECT status = 'pending'
       AND billing_email = 'commercial-journey@fluxa.test'
       AND checkout_started_at IS NOT NULL
      FROM public.organization_subscriptions
     WHERE organization_id = '29680000-0000-0000-0000-000000000001'
  ),
  'checkout is pending and bound to the buyer email'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(
  public.apply_kiwify_subscription_event(
    'commercial-journey-approved',
    '29680000-0000-0000-0000-000000000001',
    'order_approved', 'active', 'order-commercial-journey',
    'subscription-commercial-journey', now(),
    now() + interval '30 days', now() + interval '30 days'
  ),
  true,
  'Kiwify approval activates the prepared subscription'
);
SELECT is(
  public.apply_kiwify_subscription_event(
    'commercial-journey-approved',
    '29680000-0000-0000-0000-000000000001',
    'order_approved', 'active', 'order-commercial-journey',
    'subscription-commercial-journey', now(),
    now() + interval '30 days', now() + interval '30 days'
  ),
  false,
  'an exact Kiwify retry does not activate or audit the sale twice'
);
RESET ROLE;

SELECT ok(
  (
    SELECT subscription.status = 'active'
       AND subscription.provider_order_id = 'order-commercial-journey'
       AND subscription.provider_subscription_id = 'subscription-commercial-journey'
       AND subscription.access_until > now() + interval '29 days'
       AND organization.commercial_status = 'active'
      FROM public.organization_subscriptions subscription
      JOIN public.organizations organization
        ON organization.id = subscription.organization_id
     WHERE subscription.organization_id =
       '29680000-0000-0000-0000-000000000001'
  ),
  'approved payment replaces trial access with active paid access'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19680000-0000-0000-0000-000000000001","email":"commercial-journey@fluxa.test","role":"authenticated"}',
  true
);
SELECT is(
  (
    SELECT status
      FROM public.organization_subscriptions
     WHERE organization_id = '29680000-0000-0000-0000-000000000001'
  ),
  'active',
  'owner can read the active subscription on Minha assinatura'
);
SELECT throws_ok(
  $$SELECT public.prepare_kiwify_checkout(
    '29680000-0000-0000-0000-000000000001'
  )$$,
  '55000', 'SUBSCRIPTION_ALREADY_ACTIVE',
  'active customer cannot open a duplicate checkout'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.kiwify_webhook_events
     WHERE event_key = 'commercial-journey-approved'
       AND processed_at IS NOT NULL
       AND processing_error IS NULL
  ),
  1,
  'approved sale leaves one successfully processed webhook event'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE organization_id = '29680000-0000-0000-0000-000000000001'
       AND action = 'billing.checkout_started'
  ),
  1,
  'customer journey records one checkout start'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE organization_id = '29680000-0000-0000-0000-000000000001'
       AND action = 'billing.subscription_event_processed'
  ),
  1,
  'customer journey records one successful subscription event'
);

SELECT * FROM finish();
ROLLBACK;
