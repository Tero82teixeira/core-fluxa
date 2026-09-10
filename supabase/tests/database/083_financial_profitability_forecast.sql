BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_index(
  'public',
  'financial_transactions',
  'financial_transactions_client_result_idx',
  'client profitability has a dedicated index'
);
SELECT has_index(
  'public',
  'financial_transactions',
  'financial_transactions_process_result_idx',
  'process profitability has a dedicated index'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_financial_transaction(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated users reach the role-guarded update RPC'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
  ('1a600000-0000-0000-0000-000000000001','profit-owner@fluxa.test','{}','authenticated','authenticated','',now()),
  ('1a600000-0000-0000-0000-000000000002','profit-outsider@fluxa.test','{}','authenticated','authenticated','',now());

INSERT INTO public.organizations(id,legal_name,created_by)
VALUES
  ('2a600000-0000-0000-0000-000000000001','Profit Tenant','1a600000-0000-0000-0000-000000000001');

INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES
  ('2a600000-0000-0000-0000-000000000001','1a600000-0000-0000-0000-000000000001','proprietario',true);

INSERT INTO public.clients(id,organization_id,name,created_by)
VALUES
  ('3a600000-0000-0000-0000-000000000001','2a600000-0000-0000-0000-000000000001','Cliente correto','1a600000-0000-0000-0000-000000000001'),
  ('3a600000-0000-0000-0000-000000000002','2a600000-0000-0000-0000-000000000001','Outro cliente','1a600000-0000-0000-0000-000000000001');

INSERT INTO public.processes(id,organization_id,code,client_id,title,created_by)
VALUES (
  '4a600000-0000-0000-0000-000000000001',
  '2a600000-0000-0000-0000-000000000001',
  'PROC-RENT-1',
  '3a600000-0000-0000-0000-000000000001',
  'Processo rentável',
  '1a600000-0000-0000-0000-000000000001'
);

INSERT INTO public.financial_transactions(
  id, organization_id, type, description, amount, status, due_date, created_by
)
VALUES (
  '5a600000-0000-0000-0000-000000000001',
  '2a600000-0000-0000-0000-000000000001',
  'income',
  'Receita para classificar',
  500,
  'pending',
  current_date + 7,
  '1a600000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1a600000-0000-0000-0000-000000000001',true);

SELECT lives_ok(
  $$SELECT public.update_financial_transaction(
    '2a600000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'id','5a600000-0000-0000-0000-000000000001',
      'client_id','3a600000-0000-0000-0000-000000000001',
      'process_id','4a600000-0000-0000-0000-000000000001',
      'competence_date','2026-09-01'
    )
  )$$,
  'owner classifies an open financial entry through the guarded RPC'
);

SELECT is(
  (SELECT client_id::text || '|' || process_id::text || '|' || competence_date::text
     FROM public.financial_transactions
    WHERE id='5a600000-0000-0000-0000-000000000001'),
  '3a600000-0000-0000-0000-000000000001|4a600000-0000-0000-0000-000000000001|2026-09-01',
  'profitability links and competence date are persisted'
);

SELECT throws_ok(
  $$SELECT public.update_financial_transaction(
    '2a600000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'id','5a600000-0000-0000-0000-000000000001',
      'client_id','3a600000-0000-0000-0000-000000000002',
      'process_id','4a600000-0000-0000-0000-000000000001'
    )
  )$$,
  'P0001',
  'INVALID_PROCESS_CLIENT',
  'a process cannot be attributed to a different client'
);

SELECT set_config('request.jwt.claim.sub','1a600000-0000-0000-0000-000000000002',true);
SELECT throws_ok(
  $$SELECT public.update_financial_transaction(
    '2a600000-0000-0000-0000-000000000001',
    jsonb_build_object('id','5a600000-0000-0000-0000-000000000001','client_id',NULL)
  )$$,
  'P0001',
  'NOT_ALLOWED',
  'a non-member cannot change profitability links'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
