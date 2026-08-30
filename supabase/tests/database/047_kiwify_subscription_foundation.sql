BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table(
  'public', 'organization_subscriptions',
  'organization subscription table exists'
);
SELECT has_table(
  'public', 'kiwify_webhook_events',
  'Kiwify webhook event table exists'
);
SELECT has_function(
  'public', 'prepare_kiwify_checkout', ARRAY['uuid'],
  'authenticated checkout preparation function exists'
);
SELECT has_function(
  'public', 'apply_kiwify_subscription_event',
  ARRAY['text', 'uuid', 'text', 'text', 'text', 'text', 'timestamp with time zone'],
  'service-only Kiwify event function exists'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.organization_subscriptions', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.organization_subscriptions', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.organization_subscriptions', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.organization_subscriptions', 'DELETE'),
  'authenticated users can only read subscription state'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.kiwify_webhook_events', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.kiwify_webhook_events', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.kiwify_webhook_events', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.kiwify_webhook_events', 'DELETE'),
  'webhook event references are hidden from clients'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.prepare_kiwify_checkout(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.prepare_kiwify_checkout(uuid)', 'EXECUTE'
  ),
  'only signed-in users can prepare a checkout'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.apply_kiwify_subscription_event(text,uuid,text,text,text,text,timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.apply_kiwify_subscription_event(text,uuid,text,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'only the service role can apply Kiwify events'
);

SELECT * FROM finish();
ROLLBACK;
