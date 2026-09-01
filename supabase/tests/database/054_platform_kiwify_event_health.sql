BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'platform_kiwify_event_health', ARRAY['integer'],
  'platform Kiwify event health RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.platform_kiwify_event_health(integer)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.platform_kiwify_event_health(integer)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.platform_kiwify_event_health(integer)', 'EXECUTE'
  ),
  'only authenticated sessions can invoke the platform event health RPC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19640000-0000-0000-0000-000000000001', 'event-admin@fluxa.test',
    '{"full_name":"Event Admin"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19640000-0000-0000-0000-000000000002', 'event-owner@fluxa.test',
    '{"full_name":"Event Owner"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name, trade_name, created_by) VALUES (
  '29640000-0000-0000-0000-000000000001', 'Event Health Company Ltda',
  'Event Health Company', '19640000-0000-0000-0000-000000000002'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES (
  '29640000-0000-0000-0000-000000000001',
  '19640000-0000-0000-0000-000000000002', 'proprietario', true
);
INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19640000-0000-0000-0000-000000000001',
  '19640000-0000-0000-0000-000000000001'
);

INSERT INTO public.kiwify_webhook_events(
  event_key, organization_id, event_type, received_at, processed_at, processing_error
) VALUES
  (
    'health-processed', '29640000-0000-0000-0000-000000000001',
    'order_approved', now() - interval '3 minutes', now() - interval '3 minutes', NULL
  ),
  (
    'health-ignored', '29640000-0000-0000-0000-000000000001',
    'subscription_canceled', now() - interval '2 minutes', now() - interval '2 minutes',
    'SUBSCRIPTION_ID_MISMATCH_IGNORED'
  ),
  (
    'health-attention', '29640000-0000-0000-0000-000000000001',
    'order_approved', now() - interval '1 minute', NULL, 'EVENT_PROCESSING_FAILED'
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19640000-0000-0000-0000-000000000002', true
);
SELECT throws_ok(
  $$SELECT * FROM public.platform_kiwify_event_health(20)$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary organization owners cannot inspect platform billing events'
);

SELECT set_config(
  'request.jwt.claim.sub', '19640000-0000-0000-0000-000000000001', true
);
SELECT is(
  (SELECT count(*)::integer FROM public.platform_kiwify_event_health(20)),
  3,
  'platform administrator can inspect recent billing events'
);
SELECT is(
  (
    SELECT outcome
      FROM public.platform_kiwify_event_health(20)
     WHERE event_key = 'health-processed'
  ),
  'processed',
  'successful events are classified as processed'
);
SELECT is(
  (
    SELECT outcome
      FROM public.platform_kiwify_event_health(20)
     WHERE event_key = 'health-ignored'
  ),
  'ignored',
  'safe retired or stale events are classified as ignored'
);
SELECT is(
  (
    SELECT outcome
      FROM public.platform_kiwify_event_health(20)
     WHERE event_key = 'health-attention'
  ),
  'attention',
  'unprocessed failures are classified for attention'
);
SELECT is(
  (
    SELECT organization_name
      FROM public.platform_kiwify_event_health(1)
  ),
  'Event Health Company',
  'the limit is enforced and the newest event includes the company name'
);
SELECT throws_ok(
  $$SELECT * FROM public.platform_kiwify_event_health(101)$$,
  '22023', 'INVALID_EVENT_LIMIT',
  'the RPC rejects an excessive event limit'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
