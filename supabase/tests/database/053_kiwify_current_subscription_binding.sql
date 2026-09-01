BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES (
  '19650000-0000-0000-0000-000000000001',
  'lifecycle-owner@fluxa.test', '{"full_name":"Lifecycle Owner"}',
  'authenticated', 'authenticated', '', now()
);

INSERT INTO public.organizations(
  id, legal_name, created_by, commercial_status, trial_started_at, trial_ends_at
) VALUES (
  '29650000-0000-0000-0000-000000000001', 'Lifecycle Company',
  '19650000-0000-0000-0000-000000000001', 'trial',
  '2026-09-01 12:00:00+00', '2026-09-15 12:00:00+00'
);

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES (
  '29650000-0000-0000-0000-000000000001',
  '19650000-0000-0000-0000-000000000001', 'proprietario', true
);

INSERT INTO public.organization_subscriptions(
  organization_id, status, billing_email, checkout_started_at
) VALUES (
  '29650000-0000-0000-0000-000000000001', 'pending',
  'lifecycle-owner@fluxa.test', '2026-09-01 12:00:00+00'
);

SET LOCAL ROLE service_role;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'lifecycle-approved',
    '29650000-0000-0000-0000-000000000001',
    'order_approved', 'active', 'order-current', 'subscription-current',
    '2026-09-01 12:01:00+00', '2026-10-01 03:00:00+00',
    '2026-10-01 03:00:00+00'
  ),
  true,
  'the prepared checkout binds its first approved subscription'
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'lifecycle-approved',
    '29650000-0000-0000-0000-000000000001',
    'order_approved', 'active', 'order-current', 'subscription-current',
    '2026-09-01 12:01:00+00', '2026-10-01 03:00:00+00',
    '2026-10-01 03:00:00+00'
  ),
  false,
  'an exact webhook retry is idempotent'
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'lifecycle-stale-cancel',
    '29650000-0000-0000-0000-000000000001',
    'subscription_canceled', 'canceled', NULL, 'subscription-current',
    '2026-09-01 12:00:00+00', NULL, NULL
  ),
  false,
  'an event older than the approval cannot revert access'
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'lifecycle-late',
    '29650000-0000-0000-0000-000000000001',
    'subscription_late', 'past_due', NULL, 'subscription-current',
    '2026-10-01 03:00:00+00', NULL, NULL
  ),
  true,
  'a late renewal enters the grace period'
);

SELECT is(
  (
    SELECT subscription.status = 'past_due'
       AND subscription.access_until = '2026-10-06 03:00:00+00'::timestamptz
       AND organization.commercial_status = 'active'
      FROM public.organization_subscriptions subscription
      JOIN public.organizations organization
        ON organization.id = subscription.organization_id
     WHERE subscription.organization_id =
       '29650000-0000-0000-0000-000000000001'
  ),
  true,
  'late payment keeps access for exactly five additional days'
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'lifecycle-canceled',
    '29650000-0000-0000-0000-000000000001',
    'subscription_canceled', 'canceled', NULL, 'subscription-current',
    '2026-10-02 03:00:00+00', '2026-10-06 03:00:00+00', NULL
  ),
  true,
  'cancellation is recorded for the current subscription'
);

SELECT is(
  (
    SELECT subscription.status = 'canceled'
       AND subscription.next_payment_at IS NULL
       AND organization.commercial_status = 'active'
      FROM public.organization_subscriptions subscription
      JOIN public.organizations organization
        ON organization.id = subscription.organization_id
     WHERE subscription.organization_id =
       '29650000-0000-0000-0000-000000000001'
  ),
  true,
  'cancellation preserves access already paid and removes renewal date'
);

RESET ROLE;

SELECT is(
  public.suspend_expired_kiwify_subscriptions(
    '2026-10-06 02:59:59+00', 100
  ),
  0,
  'the private clock does not suspend before paid access ends'
);
SELECT is(
  public.suspend_expired_kiwify_subscriptions(
    '2026-10-06 03:00:00+00', 100
  ),
  1,
  'the private clock suspends when paid access ends'
);

UPDATE public.organization_subscriptions
   SET status = 'pending',
       checkout_started_at = '2026-10-07 12:00:00+00',
       access_until = '2026-10-06 03:00:00+00'
 WHERE organization_id = '29650000-0000-0000-0000-000000000001';

SET LOCAL ROLE service_role;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'retired-subscription-approved-late',
    '29650000-0000-0000-0000-000000000001',
    'order_approved', 'active', 'order-retired', 'subscription-current',
    '2026-10-07 12:01:00+00', '2026-11-06 03:00:00+00',
    '2026-11-06 03:00:00+00'
  ),
  false,
  'a delayed approval from the retired subscription cannot bind a new checkout'
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'new-subscription-approved',
    '29650000-0000-0000-0000-000000000001',
    'order_approved', 'active', 'order-new', 'subscription-new',
    '2026-10-07 12:02:00+00', '2026-11-06 03:00:00+00',
    '2026-11-06 03:00:00+00'
  ),
  true,
  'a new subscription identifier binds the restarted checkout'
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'retired-subscription-canceled-late',
    '29650000-0000-0000-0000-000000000001',
    'subscription_canceled', 'canceled', NULL, 'subscription-current',
    '2026-10-08 12:00:00+00', NULL, NULL
  ),
  false,
  'a later cancellation from the retired subscription cannot suspend the new one'
);

SELECT is(
  (
    SELECT subscription.status = 'active'
       AND subscription.provider_subscription_id = 'subscription-new'
       AND organization.commercial_status = 'active'
      FROM public.organization_subscriptions subscription
      JOIN public.organizations organization
        ON organization.id = subscription.organization_id
     WHERE subscription.organization_id =
       '29650000-0000-0000-0000-000000000001'
  ),
  true,
  'ignored retired events leave the new subscription active'
);

SELECT is(
  public.apply_kiwify_subscription_event(
    'new-subscription-refunded',
    '29650000-0000-0000-0000-000000000001',
    'order_refunded', 'refunded', NULL, 'subscription-new',
    '2026-10-09 12:00:00+00', NULL, NULL
  ),
  true,
  'a refund from the current subscription is applied immediately'
);

RESET ROLE;

SELECT is(
  (
    SELECT subscription.status = 'refunded'
       AND subscription.access_until = '2026-10-09 12:00:00+00'::timestamptz
       AND organization.commercial_status = 'suspended'
      FROM public.organization_subscriptions subscription
      JOIN public.organizations organization
        ON organization.id = subscription.organization_id
     WHERE subscription.organization_id =
       '29650000-0000-0000-0000-000000000001'
  ),
  true,
  'current refund suspends access without deleting the organization'
);

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.organization_members
     WHERE organization_id = '29650000-0000-0000-0000-000000000001'
  ),
  1,
  'the complete billing lifecycle preserves company members and data'
);

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE organization_id = '29650000-0000-0000-0000-000000000001'
       AND action = 'billing.subscription_event_processed'
  ),
  5,
  'only the five applied lifecycle transitions create audit entries'
);

SELECT is(
  (
    SELECT processing_error
      FROM public.kiwify_webhook_events
     WHERE event_key = 'retired-subscription-canceled-late'
  ),
  'SUBSCRIPTION_ID_MISMATCH_IGNORED',
  'the ignored retired event keeps a diagnostic reference'
);

SELECT * FROM finish();
ROLLBACK;
