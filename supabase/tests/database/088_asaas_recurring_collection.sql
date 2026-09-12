BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public','asaas_charge_jobs','automatic Asaas charge queue exists');
SELECT has_table('public','asaas_reminder_push_claims','payment reminder push claims exist');
SELECT has_column('public','financial_recurrences','asaas_auto_charge','recurrence has Asaas opt-in');
SELECT has_column('public','financial_recurrences','asaas_charge_days_before','recurrence has lead days');
SELECT ok(
  NOT has_table_privilege('authenticated','public.asaas_charge_jobs','INSERT')
  AND has_table_privilege('authenticated','public.asaas_charge_jobs','SELECT'),
  'browser can inspect its queue but cannot write it directly'
);
SELECT ok(
  NOT has_function_privilege('authenticated','public.claim_asaas_charge_jobs(integer)','EXECUTE')
  AND has_function_privilege('service_role','public.claim_asaas_charge_jobs(integer)','EXECUTE'),
  'only the service worker can claim charge jobs'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
('1a880000-0000-0000-0000-000000000001','automation-owner@fluxa.test','{}','authenticated','authenticated','',now()),
('1a880000-0000-0000-0000-000000000002','automation-client@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name,created_by) VALUES
('2a880000-0000-0000-0000-000000000001','Automation Tenant Ltda','Automation Tenant','1a880000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2a880000-0000-0000-0000-000000000001','1a880000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.clients(id,organization_id,name,document_digits,email) VALUES
('3a880000-0000-0000-0000-000000000001','2a880000-0000-0000-0000-000000000001','Cliente Recorrente','11144477735','automation-client@fluxa.test');
INSERT INTO public.client_portal_access(id,organization_id,client_id,user_id,email,is_active,invited_by) VALUES
('4a880000-0000-0000-0000-000000000001','2a880000-0000-0000-0000-000000000001','3a880000-0000-0000-0000-000000000001','1a880000-0000-0000-0000-000000000002','automation-client@fluxa.test',true,'1a880000-0000-0000-0000-000000000001');
INSERT INTO public.financial_accounts(id,organization_id,name,type,created_by) VALUES
('5a880000-0000-0000-0000-000000000001','2a880000-0000-0000-0000-000000000001','Conta Automação','bank','1a880000-0000-0000-0000-000000000001');
INSERT INTO public.financial_recurrences(
  id,organization_id,name,type,amount,frequency,start_date,next_run_date,
  client_id,asaas_auto_charge,asaas_charge_days_before,created_by
) VALUES (
  '6a880000-0000-0000-0000-000000000001','2a880000-0000-0000-0000-000000000001',
  'Mensalidade recorrente','income',149.90,'monthly',current_date,current_date,
  '3a880000-0000-0000-0000-000000000001',true,3,'1a880000-0000-0000-0000-000000000001'
);
INSERT INTO public.financial_transactions(
  id,organization_id,type,description,amount,status,due_date,client_id,
  recurrence_id,recurrence_due_date,created_by
) VALUES (
  '7a880000-0000-0000-0000-000000000001','2a880000-0000-0000-0000-000000000001',
  'income','Mensalidade recorrente',149.90,'pending',current_date + 3,
  '3a880000-0000-0000-0000-000000000001','6a880000-0000-0000-0000-000000000001',
  current_date + 3,'1a880000-0000-0000-0000-000000000001'
);

SELECT is(
  (SELECT count(*) FROM public.asaas_charge_jobs WHERE transaction_id='7a880000-0000-0000-0000-000000000001'),
  1::bigint,'eligible recurrence queues exactly one charge job'
);
UPDATE public.financial_transactions SET description='Mensalidade atualizada'
WHERE id='7a880000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*) FROM public.asaas_charge_jobs WHERE transaction_id='7a880000-0000-0000-0000-000000000001'),
  1::bigint,'updating a transaction does not duplicate its charge job'
);

INSERT INTO public.asaas_connections(
  id,organization_id,public_token,environment,status,account_name,
  settlement_account_id,created_by,updated_by
) VALUES (
  '8a880000-0000-0000-0000-000000000001','2a880000-0000-0000-0000-000000000001',
  '8a880000-0000-0000-0000-000000000002','sandbox','connected','Sandbox Automação',
  '5a880000-0000-0000-0000-000000000001','1a880000-0000-0000-0000-000000000001',
  '1a880000-0000-0000-0000-000000000001'
);
INSERT INTO public.asaas_charges(
  id,organization_id,connection_id,transaction_id,client_id,provider_payment_id,
  provider_customer_id,status,amount,due_date,invoice_url,created_by
) VALUES (
  '9a880000-0000-0000-0000-000000000001','2a880000-0000-0000-0000-000000000001',
  '8a880000-0000-0000-0000-000000000001','7a880000-0000-0000-0000-000000000001',
  '3a880000-0000-0000-0000-000000000001','pay_auto_1','cus_auto_1','pending',149.90,
  current_date + 3,'https://sandbox.asaas.com/i/auto','1a880000-0000-0000-0000-000000000001'
);

SELECT is(public.create_asaas_client_payment_notifications(
  (current_date + time '12:00') AT TIME ZONE 'America/Sao_Paulo'
),1,'first reminder scan creates one portal notification');
SELECT is(public.create_asaas_client_payment_notifications(
  (current_date + time '12:00') AT TIME ZONE 'America/Sao_Paulo'
),0,'second reminder scan is idempotent');
SELECT is(
  (SELECT entity_type FROM public.client_portal_notifications WHERE entity_id='9a880000-0000-0000-0000-000000000001'),
  'asaas_charge','reminder points to the exact hosted charge'
);

SELECT * FROM finish();
ROLLBACK;
