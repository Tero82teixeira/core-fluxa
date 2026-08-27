BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'restore_financial_category', ARRAY['uuid', 'jsonb'],
  'financial category restore RPC exists'
);
SELECT has_function(
  'public', 'restore_financial_account', ARRAY['uuid', 'jsonb'],
  'financial account restore RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.restore_financial_category(uuid,jsonb)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated', 'public.restore_financial_account(uuid,jsonb)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.restore_financial_category(uuid,jsonb)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.restore_financial_account(uuid,jsonb)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.restore_financial_category(uuid,jsonb)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.restore_financial_account(uuid,jsonb)', 'EXECUTE'
  ),
  'only authenticated client sessions can invoke structure restore RPCs'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  (
    '19520000-0000-0000-0000-000000000001',
    'structure-owner@fluxa.test', '{"full_name":"Owner Estruturas"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19520000-0000-0000-0000-000000000002',
    'structure-viewer@fluxa.test', '{"full_name":"Viewer Estruturas"}',
    'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name) VALUES
  ('29520000-0000-0000-0000-000000000001', 'Structure Tenant A'),
  ('29520000-0000-0000-0000-000000000002', 'Structure Tenant B');

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29520000-0000-0000-0000-000000000001',
    '19520000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29520000-0000-0000-0000-000000000001',
    '19520000-0000-0000-0000-000000000002', 'visualizador', true
  );

INSERT INTO public.financial_categories(
  id, organization_id, name, type, is_active, archived_at, created_by
) VALUES
  (
    '39520000-0000-0000-0000-000000000001',
    '29520000-0000-0000-0000-000000000001',
    'Category archived', 'both', false, now(),
    '19520000-0000-0000-0000-000000000001'
  ),
  (
    '39520000-0000-0000-0000-000000000002',
    '29520000-0000-0000-0000-000000000001',
    'Category active', 'both', true, NULL,
    '19520000-0000-0000-0000-000000000001'
  ),
  (
    '39520000-0000-0000-0000-000000000003',
    '29520000-0000-0000-0000-000000000002',
    'Other tenant category', 'both', false, now(),
    '19520000-0000-0000-0000-000000000001'
  );

INSERT INTO public.financial_accounts(
  id, organization_id, name, type, initial_balance, current_balance,
  is_active, archived_at, created_by
) VALUES
  (
    '49520000-0000-0000-0000-000000000001',
    '29520000-0000-0000-0000-000000000001',
    'Account archived', 'bank', 125, 175, false, now(),
    '19520000-0000-0000-0000-000000000001'
  ),
  (
    '49520000-0000-0000-0000-000000000002',
    '29520000-0000-0000-0000-000000000001',
    'Account active', 'bank', 50, 50, true, NULL,
    '19520000-0000-0000-0000-000000000001'
  ),
  (
    '49520000-0000-0000-0000-000000000003',
    '29520000-0000-0000-0000-000000000002',
    'Other tenant account', 'bank', 25, 25, false, now(),
    '19520000-0000-0000-0000-000000000001'
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19520000-0000-0000-0000-000000000001', true
);

SELECT lives_ok(
  $$SELECT public.restore_financial_category(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"39520000-0000-0000-0000-000000000001"}'::jsonb
  )$$,
  'an archived category can be restored'
);
SELECT lives_ok(
  $$SELECT public.restore_financial_account(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"49520000-0000-0000-0000-000000000001"}'::jsonb
  )$$,
  'an archived account can be restored'
);
SELECT throws_ok(
  $$SELECT public.restore_financial_category(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"39520000-0000-0000-0000-000000000002"}'::jsonb
  )$$,
  'P0001', 'CATEGORY_NOT_RESTORABLE',
  'an active category cannot be restored'
);
SELECT throws_ok(
  $$SELECT public.restore_financial_account(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"49520000-0000-0000-0000-000000000002"}'::jsonb
  )$$,
  'P0001', 'ACCOUNT_NOT_RESTORABLE',
  'an active account cannot be restored'
);
SELECT throws_ok(
  $$SELECT public.restore_financial_category(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"39520000-0000-0000-0000-000000000003"}'::jsonb
  )$$,
  'P0001', 'CATEGORY_NOT_RESTORABLE',
  'a category from another tenant cannot be restored'
);
SELECT throws_ok(
  $$SELECT public.restore_financial_account(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"49520000-0000-0000-0000-000000000003"}'::jsonb
  )$$,
  'P0001', 'ACCOUNT_NOT_RESTORABLE',
  'an account from another tenant cannot be restored'
);
RESET ROLE;

SELECT ok(
  (
    SELECT archived_at IS NULL
      AND NOT is_active
    FROM public.financial_categories
    WHERE id = '39520000-0000-0000-0000-000000000001'
  ),
  'restored category remains inactive'
);
SELECT ok(
  (
    SELECT archived_at IS NULL
      AND NOT is_active
      AND initial_balance = 125
      AND current_balance = 175
    FROM public.financial_accounts
    WHERE id = '49520000-0000-0000-0000-000000000001'
  ),
  'restored account remains inactive and preserves its balance'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE organization_id = '29520000-0000-0000-0000-000000000001'
      AND action IN (
        'financial.category.restored', 'financial.account.restored'
      )
  ),
  2::bigint,
  'every successful structure restore is audited'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19520000-0000-0000-0000-000000000002', true
);
SELECT throws_ok(
  $$SELECT public.restore_financial_category(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"39520000-0000-0000-0000-000000000001"}'::jsonb
  )$$,
  'P0001', 'NOT_ALLOWED',
  'a viewer cannot restore financial categories'
);
SELECT throws_ok(
  $$SELECT public.restore_financial_account(
    '29520000-0000-0000-0000-000000000001',
    '{"id":"49520000-0000-0000-0000-000000000001"}'::jsonb
  )$$,
  'P0001', 'NOT_ALLOWED',
  'a viewer cannot restore financial accounts'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
