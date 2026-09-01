BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'record_kiwify_webhook_failure',
  ARRAY['text', 'text', 'text', 'uuid', 'text', 'text'],
  'Kiwify failure recorder exists'
);
SELECT has_function(
  'public', 'resolve_kiwify_webhook_failure', ARRAY['text'],
  'Kiwify failure resolver exists'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.record_kiwify_webhook_failure(text, text, text, uuid, text, text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role', 'public.resolve_kiwify_webhook_failure(text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.record_kiwify_webhook_failure(text, text, text, uuid, text, text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.resolve_kiwify_webhook_failure(text)', 'EXECUTE'
  ),
  'only the trusted webhook service can record or resolve failures'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19670000-0000-0000-0000-000000000001', 'failure-admin@fluxa.test',
    '{"full_name":"Failure Admin"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19670000-0000-0000-0000-000000000002', 'failure-owner@fluxa.test',
    '{"full_name":"Failure Owner"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.profiles(id, full_name, email) VALUES
  (
    '19670000-0000-0000-0000-000000000001',
    'Failure Admin', 'failure-admin@fluxa.test'
  ),
  (
    '19670000-0000-0000-0000-000000000002',
    'Failure Owner', 'failure-owner@fluxa.test'
  )
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;

INSERT INTO public.organizations(id, legal_name, trade_name, created_by) VALUES
  (
    '29670000-0000-0000-0000-000000000001',
    'Platform Administration Ltda', 'Platform Administration',
    '19670000-0000-0000-0000-000000000001'
  ),
  (
    '29670000-0000-0000-0000-000000000002',
    'Payment Customer Ltda', 'Payment Customer',
    '19670000-0000-0000-0000-000000000002'
  );

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  (
    '29670000-0000-0000-0000-000000000001',
    '19670000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29670000-0000-0000-0000-000000000002',
    '19670000-0000-0000-0000-000000000002', 'proprietario', true
  );

INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19670000-0000-0000-0000-000000000001',
  '19670000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT lives_ok(
  $$SELECT public.record_kiwify_webhook_failure(
    'failed-payment-event',
    'order_approved',
    'EVENT_PROCESSING_FAILED',
    '29670000-0000-0000-0000-000000000002',
    'order-failed',
    'subscription-failed'
  )$$,
  'webhook service can record an actionable failure'
);
SELECT lives_ok(
  $$SELECT public.record_kiwify_webhook_failure(
    'failed-payment-event',
    'order_approved',
    'EVENT_PROCESSING_FAILED',
    '29670000-0000-0000-0000-000000000002',
    'order-failed',
    'subscription-failed'
  )$$,
  'repeated Kiwify failure remains idempotent'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.kiwify_webhook_events
     WHERE event_key = 'failure:failed-payment-event'
  ),
  1,
  'failure is stored once without a raw buyer payload'
);
SELECT is(
  (
    SELECT processing_error
      FROM public.kiwify_webhook_events
     WHERE event_key = 'failure:failed-payment-event'
  ),
  'EVENT_PROCESSING_FAILED',
  'failure keeps only an approved diagnostic code'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.notifications
     WHERE user_id = '19670000-0000-0000-0000-000000000001'
       AND title = 'Falha no pagamento Kiwify'
  ),
  1,
  'platform administrator receives one deduplicated alert'
);
SELECT is(
  (
    SELECT action_url
      FROM public.notifications
     WHERE user_id = '19670000-0000-0000-0000-000000000001'
       AND title = 'Falha no pagamento Kiwify'
  ),
  '/administracao-plataforma',
  'failure alert opens the secure platform administration page'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19670000-0000-0000-0000-000000000001', true
);
SELECT is(
  (
    SELECT outcome
      FROM public.platform_kiwify_event_health(20)
     WHERE event_key = 'failure:failed-payment-event'
  ),
  'attention',
  'recorded failure immediately appears in payment health'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT lives_ok(
  $$SELECT public.resolve_kiwify_webhook_failure('failed-payment-event')$$,
  'successful webhook retry resolves the previous failure'
);
SELECT lives_ok(
  $$SELECT public.resolve_kiwify_webhook_failure('failed-payment-event')$$,
  'resolving the same failure twice is idempotent'
);
RESET ROLE;

SELECT is(
  (
    SELECT processing_error
      FROM public.kiwify_webhook_events
     WHERE event_key = 'failure:failed-payment-event'
  ),
  'RETRY_SUCCEEDED_IGNORED',
  'recovered failure no longer requires attention'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.notifications
     WHERE user_id = '19670000-0000-0000-0000-000000000001'
       AND title = 'Evento Kiwify recuperado'
  ),
  1,
  'platform administrator is told that the retry recovered safely'
);

SELECT * FROM finish();
ROLLBACK;
