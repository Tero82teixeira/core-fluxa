BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public','asaas_connections','Asaas connections exist');
SELECT has_table('public','asaas_connection_secrets','encrypted Asaas secrets exist');
SELECT has_table('public','asaas_charges','Asaas charges exist');
SELECT has_table('public','asaas_webhook_events','idempotent webhook events exist');
SELECT ok(
  NOT has_table_privilege('authenticated','public.asaas_connection_secrets','SELECT')
  AND NOT has_table_privilege('authenticated','public.asaas_charges','INSERT'),
  'browser cannot read secrets or create charges directly'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
('1a870000-0000-0000-0000-000000000001','asaas-owner@fluxa.test','{}','authenticated','authenticated','',now()),
('1a870000-0000-0000-0000-000000000002','asaas-client@fluxa.test','{}','authenticated','authenticated','',now()),
('1a870000-0000-0000-0000-000000000003','asaas-outsider@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name,created_by) VALUES
('2a870000-0000-0000-0000-000000000001','Asaas Tenant Ltda','Empresa Asaas','1a870000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2a870000-0000-0000-0000-000000000001','1a870000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.clients(id,organization_id,name) VALUES
('3a870000-0000-0000-0000-000000000001','2a870000-0000-0000-0000-000000000001','Cliente Asaas');
INSERT INTO public.client_portal_access(id,organization_id,client_id,user_id,email,is_active,invited_by) VALUES
('4a870000-0000-0000-0000-000000000001','2a870000-0000-0000-0000-000000000001','3a870000-0000-0000-0000-000000000001','1a870000-0000-0000-0000-000000000002','asaas-client@fluxa.test',true,'1a870000-0000-0000-0000-000000000001');
INSERT INTO public.financial_accounts(id,organization_id,name,type,created_by) VALUES
('5a870000-0000-0000-0000-000000000001','2a870000-0000-0000-0000-000000000001','Conta Asaas','bank','1a870000-0000-0000-0000-000000000001');
INSERT INTO public.financial_transactions(id,organization_id,type,description,amount,status,due_date,client_id,created_by) VALUES
('6a870000-0000-0000-0000-000000000001','2a870000-0000-0000-0000-000000000001','income','Mensalidade do serviço',250,'pending',current_date,'3a870000-0000-0000-0000-000000000001','1a870000-0000-0000-0000-000000000001');
INSERT INTO public.asaas_connections(id,organization_id,public_token,environment,status,account_name,settlement_account_id,created_by,updated_by) VALUES
('7a870000-0000-0000-0000-000000000001','2a870000-0000-0000-0000-000000000001','8a870000-0000-0000-0000-000000000001','sandbox','connected','Sandbox Empresa','5a870000-0000-0000-0000-000000000001','1a870000-0000-0000-0000-000000000001','1a870000-0000-0000-0000-000000000001');
INSERT INTO public.asaas_charges(id,organization_id,connection_id,transaction_id,client_id,provider_payment_id,provider_customer_id,status,amount,due_date,invoice_url,created_by) VALUES
('9a870000-0000-0000-0000-000000000001','2a870000-0000-0000-0000-000000000001','7a870000-0000-0000-0000-000000000001','6a870000-0000-0000-0000-000000000001','3a870000-0000-0000-0000-000000000001','pay_test_1','cus_test_1','pending',250,current_date,'https://sandbox.asaas.com/i/test','1a870000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1a870000-0000-0000-0000-000000000001',true);
SELECT throws_ok(
  $$SELECT public.register_partial_payment('2a870000-0000-0000-0000-000000000001','6a870000-0000-0000-0000-000000000001',50,'5a870000-0000-0000-0000-000000000001','Pix','manual')$$,
  'P0001','ACTIVE_ASAAS_CHARGE','manual payment is blocked while hosted charge is active'
);
RESET ROLE;

SELECT lives_ok(
  $$SELECT public.apply_asaas_payment_event('8a870000-0000-0000-0000-000000000001','evt_received_1','PAYMENT_RECEIVED','pay_test_1','RECEIVED',now(),250)$$,
  'received webhook is reconciled'
);
SELECT is((SELECT status FROM public.financial_transactions WHERE id='6a870000-0000-0000-0000-000000000001'),'paid','transaction becomes paid');
SELECT is((SELECT current_balance FROM public.financial_accounts WHERE id='5a870000-0000-0000-0000-000000000001'),250::numeric,'settlement account receives the amount');
SELECT is((SELECT count(*) FROM public.financial_transaction_payments WHERE transaction_id='6a870000-0000-0000-0000-000000000001'),1::bigint,'one automatic payment is created');
SELECT lives_ok(
  $$SELECT public.apply_asaas_payment_event('8a870000-0000-0000-0000-000000000001','evt_received_1','PAYMENT_RECEIVED','pay_test_1','RECEIVED',now(),250)$$,
  'duplicate webhook is accepted idempotently'
);
SELECT is((SELECT count(*) FROM public.financial_transaction_payments WHERE transaction_id='6a870000-0000-0000-0000-000000000001'),1::bigint,'duplicate event creates no second payment');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1a870000-0000-0000-0000-000000000002',true);
SELECT is((SELECT count(*) FROM public.client_portal_asaas_charges()),1::bigint,'linked client sees its charge');
SELECT set_config('request.jwt.claim.sub','1a870000-0000-0000-0000-000000000003',true);
SELECT is((SELECT count(*) FROM public.client_portal_asaas_charges()),0::bigint,'outsider sees no charge');
RESET ROLE;

SELECT lives_ok(
  $$SELECT public.apply_asaas_payment_event('8a870000-0000-0000-0000-000000000001','evt_refund_1','PAYMENT_REFUNDED','pay_test_1','REFUNDED',now(),250)$$,
  'full refund reverses the reconciliation'
);
SELECT is((SELECT current_balance FROM public.financial_accounts WHERE id='5a870000-0000-0000-0000-000000000001'),0::numeric,'refund reverses account balance');
SELECT is((SELECT status FROM public.financial_transactions WHERE id='6a870000-0000-0000-0000-000000000001'),'pending','refunded transaction reopens');

SELECT * FROM finish();
ROLLBACK;
