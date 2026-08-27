BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'restore_financial_transaction', ARRAY['uuid', 'jsonb'],
  'financial transaction restore RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.restore_financial_transaction(uuid,jsonb)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.restore_financial_transaction(uuid,jsonb)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.restore_financial_transaction(uuid,jsonb)', 'EXECUTE'
  ),
  'only authenticated client sessions can invoke the restore RPC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  (
    '19510000-0000-0000-0000-000000000001',
    'archive-owner@fluxa.test', '{"full_name":"Owner Arquivo"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19510000-0000-0000-0000-000000000002',
    'archive-viewer@fluxa.test', '{"full_name":"Viewer Arquivo"}',
    'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name) VALUES
  ('29510000-0000-0000-0000-000000000001', 'Archive Tenant A'),
  ('29510000-0000-0000-0000-000000000002', 'Archive Tenant B');

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29510000-0000-0000-0000-000000000001',
    '19510000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29510000-0000-0000-0000-000000000001',
    '19510000-0000-0000-0000-000000000002', 'visualizador', true
  );

INSERT INTO public.financial_transactions(
  id, organization_id, type, description, amount, status, due_date,
  created_by, archived_at
) VALUES
  (
    '49510000-0000-0000-0000-000000000001',
    '29510000-0000-0000-0000-000000000001', 'income',
    'Paid archived', 100, 'paid', current_date,
    '19510000-0000-0000-0000-000000000001', now()
  ),
  (
    '49510000-0000-0000-0000-000000000002',
    '29510000-0000-0000-0000-000000000001', 'expense',
    'Cancelled archived', 80, 'cancelled', current_date,
    '19510000-0000-0000-0000-000000000001', now()
  ),
  (
    '49510000-0000-0000-0000-000000000003',
    '29510000-0000-0000-0000-000000000001', 'income',
    'Cancelled active', 60, 'cancelled', current_date,
    '19510000-0000-0000-0000-000000000001', NULL
  ),
  (
    '49510000-0000-0000-0000-000000000004',
    '29510000-0000-0000-0000-000000000002', 'income',
    'Other tenant archived', 40, 'cancelled', current_date,
    '19510000-0000-0000-0000-000000000001', now()
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19510000-0000-0000-0000-000000000001', true
);

SELECT lives_ok(
  $$SELECT public.restore_financial_transaction(
    '29510000-0000-0000-0000-000000000001',
    '{"id":"49510000-0000-0000-0000-000000000001"}'::jsonb
  )$$,
  'an archived paid transaction can be restored'
);
SELECT lives_ok(
  $$SELECT public.restore_financial_transaction(
    '29510000-0000-0000-0000-000000000001',
    '{"id":"49510000-0000-0000-0000-000000000002"}'::jsonb
  )$$,
  'an archived cancelled transaction can be restored'
);
SELECT throws_ok(
  $$SELECT public.restore_financial_transaction(
    '29510000-0000-0000-0000-000000000001',
    '{"id":"49510000-0000-0000-0000-000000000003"}'::jsonb
  )$$,
  'P0001', 'TRANSACTION_NOT_RESTORABLE',
  'an active transaction cannot be restored'
);
SELECT throws_ok(
  $$SELECT public.restore_financial_transaction(
    '29510000-0000-0000-0000-000000000001',
    '{"id":"49510000-0000-0000-0000-000000000004"}'::jsonb
  )$$,
  'P0001', 'TRANSACTION_NOT_RESTORABLE',
  'a transaction from another tenant cannot be restored'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.financial_transactions
    WHERE id IN (
      '49510000-0000-0000-0000-000000000001',
      '49510000-0000-0000-0000-000000000002'
    )
      AND archived_at IS NULL
      AND status IN ('paid', 'cancelled')
  ),
  2::bigint,
  'restore preserves final status and clears only archived_at'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE organization_id = '29510000-0000-0000-0000-000000000001'
      AND action = 'financial.transaction.restored'
      AND entity = 'financial_transaction'
  ),
  2::bigint,
  'every successful restore is audited'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19510000-0000-0000-0000-000000000002', true
);
SELECT throws_ok(
  $$SELECT public.restore_financial_transaction(
    '29510000-0000-0000-0000-000000000001',
    '{"id":"49510000-0000-0000-0000-000000000001"}'::jsonb
  )$$,
  'P0001', 'NOT_ALLOWED',
  'a viewer cannot restore financial transactions'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
