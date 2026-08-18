BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(77);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('12000000-0000-0000-0000-000000000001','finance-owner@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('22000000-0000-0000-0000-000000000001','Finance A Ltda','Finance A'),
 ('22000000-0000-0000-0000-000000000002','Finance B Ltda','Finance B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.clients(id,organization_id,name) VALUES
 ('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Cliente A'),
 ('32000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000002','Cliente B');
INSERT INTO public.service_types(id,organization_id,name) VALUES
 ('42000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Servico A'),
 ('42000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000002','Servico B');
INSERT INTO public.processes(id,organization_id,code,client_id,service_type_id) VALUES
 ('52000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','A-1','32000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001'),
 ('52000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000002','B-1','32000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000002');
INSERT INTO public.financial_categories(id,organization_id,name,type,created_by) VALUES
 ('62000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Categoria A','both','12000000-0000-0000-0000-000000000001'),
 ('62000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000002','Categoria B','both','12000000-0000-0000-0000-000000000001');
INSERT INTO public.financial_accounts(id,organization_id,name,type,created_by) VALUES
 ('72000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Conta A','bank','12000000-0000-0000-0000-000000000001'),
 ('72000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000002','Conta B','bank','12000000-0000-0000-0000-000000000001');
INSERT INTO public.financial_transactions(id,organization_id,type,description,amount,status,due_date,created_by) VALUES
 ('82000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','income','Parcial',1000,'partial',current_date,'12000000-0000-0000-0000-000000000001');
INSERT INTO public.financial_transaction_payments(id,organization_id,transaction_id,amount,account_id,created_by,reversed_at) VALUES
 ('92000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001',700,'72000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',NULL),
 ('92000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001',400,'72000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001',now());
INSERT INTO public.financial_recurrences(id,organization_id,name,type,amount,category_id,account_id,frequency,start_date,next_run_date,client_id,process_id,created_by) VALUES
 ('a2000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Recorrencia A','income',100,'62000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','monthly','2026-01-01','2026-01-01','32000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
SELECT throws_ok($$SELECT public.update_financial_transaction('22000000-0000-0000-0000-000000000001','{"id":"82000000-0000-0000-0000-000000000001","amount":600}'::jsonb)$$,'P0001','AMOUNT_BELOW_PAID_TOTAL','amount abaixo do total ativo falha');
SELECT lives_ok($$SELECT public.update_financial_transaction('22000000-0000-0000-0000-000000000001','{"id":"82000000-0000-0000-0000-000000000001","amount":700}'::jsonb)$$,'amount igual ao total ativo e permitido');
SELECT lives_ok($$SELECT public.update_financial_transaction('22000000-0000-0000-0000-000000000001','{"id":"82000000-0000-0000-0000-000000000001","amount":900}'::jsonb)$$,'amount acima do total ativo e permitido');
SELECT lives_ok($$SELECT public.update_financial_transaction('22000000-0000-0000-0000-000000000001','{"id":"82000000-0000-0000-0000-000000000001","amount":700}'::jsonb)$$,'pagamento revertido nao compoe o total ativo');
RESET ROLE;

SELECT throws_ok($$UPDATE public.financial_recurrences SET category_id='62000000-0000-0000-0000-000000000002' WHERE id='a2000000-0000-0000-0000-000000000001'$$,'P0001','INVALID_CATEGORY_ORGANIZATION','categoria cross-org falha');
SELECT throws_ok($$UPDATE public.financial_recurrences SET account_id='72000000-0000-0000-0000-000000000002' WHERE id='a2000000-0000-0000-0000-000000000001'$$,'P0001','INVALID_ACCOUNT_ORGANIZATION','conta cross-org falha');
SELECT throws_ok($$UPDATE public.financial_recurrences SET client_id='32000000-0000-0000-0000-000000000002' WHERE id='a2000000-0000-0000-0000-000000000001'$$,'P0001','INVALID_CLIENT_ORGANIZATION','cliente cross-org falha');
SELECT throws_ok($$UPDATE public.financial_recurrences SET process_id='52000000-0000-0000-0000-000000000002' WHERE id='a2000000-0000-0000-0000-000000000001'$$,'P0001','INVALID_PROCESS_ORGANIZATION','processo cross-org falha');
SELECT throws_ok($$UPDATE public.financial_recurrences SET end_date='2025-12-31' WHERE id='a2000000-0000-0000-0000-000000000001'$$,'P0001','INVALID_END_DATE','fim anterior ao inicio falha');
SELECT throws_ok($$UPDATE public.financial_recurrences SET next_run_date='2025-12-31' WHERE id='a2000000-0000-0000-0000-000000000001'$$,'P0001','INVALID_NEXT_RUN_DATE','proxima execucao anterior ao inicio falha');
SELECT throws_ok($$UPDATE public.financial_recurrences SET end_date='2026-06-01',next_run_date='2026-07-01' WHERE id='a2000000-0000-0000-0000-000000000001'$$,'P0001','INVALID_NEXT_RUN_DATE','proxima execucao depois do fim em recorrencia ativa falha');

SELECT ok(NOT has_table_privilege(role_name, 'public.' || table_name, privilege_name), role_name || ' sem ' || privilege_name || ' em ' || table_name)
FROM unnest(ARRAY['authenticated','anon']) role_name
CROSS JOIN unnest(ARRAY['financial_categories','financial_accounts','financial_transactions','financial_transaction_payments','financial_recurrences','financial_account_movements']) table_name
CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) privilege_name;

SELECT ok(has_function_privilege('authenticated', 'public.' || rpc.signature, 'EXECUTE'), 'authenticated executa ' || rpc.name)
FROM (VALUES
 ('create_financial_transaction','create_financial_transaction(uuid,jsonb)'), ('update_financial_transaction','update_financial_transaction(uuid,jsonb)'),
 ('mark_financial_transaction_paid','mark_financial_transaction_paid(uuid,uuid,uuid,text)'), ('register_partial_payment','register_partial_payment(uuid,uuid,numeric,uuid,text,text)'),
 ('cancel_financial_transaction','cancel_financial_transaction(uuid,jsonb)'), ('duplicate_financial_transaction','duplicate_financial_transaction(uuid,jsonb)'),
 ('archive_financial_transaction','archive_financial_transaction(uuid,jsonb)'), ('create_financial_category','create_financial_category(uuid,jsonb)'),
 ('update_financial_category','update_financial_category(uuid,jsonb)'), ('set_financial_category_active','set_financial_category_active(uuid,jsonb)'),
 ('archive_financial_category','archive_financial_category(uuid,jsonb)'), ('create_financial_account','create_financial_account(uuid,jsonb)'),
 ('update_financial_account','update_financial_account(uuid,jsonb)'), ('set_financial_account_active','set_financial_account_active(uuid,jsonb)'),
 ('archive_financial_account','archive_financial_account(uuid,jsonb)'), ('create_financial_recurrence','create_financial_recurrence(uuid,jsonb)'),
 ('update_financial_recurrence','update_financial_recurrence(uuid,jsonb)'), ('reverse_financial_payment','reverse_financial_payment(uuid,uuid,text)')
) AS rpc(name,signature);

SELECT * FROM finish();
ROLLBACK;
