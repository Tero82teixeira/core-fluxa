BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public','commercial_opportunities','commercial opportunities table exists');
SELECT has_table('public','member_performance_goals','individual goals table exists');
SELECT ok(NOT has_table_privilege('authenticated','public.commercial_opportunities','INSERT') AND NOT has_table_privilege('authenticated','public.member_performance_goals','UPDATE'),'browser cannot write new tables directly');
SELECT ok(has_function_privilege('authenticated','public.upsert_commercial_opportunity(uuid,uuid,text,text,numeric,integer,uuid,uuid,timestamptz,text)','EXECUTE'),'authenticated reaches guarded opportunity RPC');

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
('1c600000-0000-0000-0000-000000000001','commercial-manager@fluxa.test','{}','authenticated','authenticated','',now()),
('1c600000-0000-0000-0000-000000000002','commercial-viewer@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,created_by) VALUES('2c600000-0000-0000-0000-000000000001','Commercial Tenant','1c600000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2c600000-0000-0000-0000-000000000001','1c600000-0000-0000-0000-000000000001','gestor',true),
('2c600000-0000-0000-0000-000000000001','1c600000-0000-0000-0000-000000000002','visualizador',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1c600000-0000-0000-0000-000000000001',true);
SELECT lives_ok($$SELECT public.upsert_commercial_opportunity('2c600000-0000-0000-0000-000000000001',NULL,'Contrato anual','proposal',12000,60,NULL,'1c600000-0000-0000-0000-000000000001',now() + interval '2 days',NULL)$$,'manager creates a scoped opportunity');
SELECT is((SELECT stage || '|' || estimated_value::text || '|' || probability::text FROM public.commercial_opportunities WHERE organization_id='2c600000-0000-0000-0000-000000000001'),'proposal|12000.00|60','opportunity values are persisted');
SELECT throws_ok($$SELECT public.upsert_commercial_opportunity('2c600000-0000-0000-0000-000000000001',NULL,'Venda perdida','lost',100,0,NULL,NULL,NULL,NULL)$$,'P0001','LOST_REASON_REQUIRED','lost opportunity requires a reason');
SELECT lives_ok($$SELECT public.set_member_performance_goals('2c600000-0000-0000-0000-000000000001','1c600000-0000-0000-0000-000000000002','2026-09-18',15,4)$$,'manager sets individual goals');
SELECT is((SELECT goal_month::text || '|' || completed_tasks_target::text || '|' || completed_processes_target::text FROM public.member_performance_goals WHERE user_id='1c600000-0000-0000-0000-000000000002'),'2026-09-01|15|4','individual month is normalized');

SELECT set_config('request.jwt.claim.sub','1c600000-0000-0000-0000-000000000002',true);
SELECT throws_ok($$SELECT public.upsert_commercial_opportunity('2c600000-0000-0000-0000-000000000001',NULL,'Sem permissão','proposal',100,50,NULL,NULL,NULL,NULL)$$,'P0001','NOT_ALLOWED','viewer cannot create opportunities');
SELECT throws_ok($$SELECT public.set_member_performance_goals('2c600000-0000-0000-0000-000000000001','1c600000-0000-0000-0000-000000000002','2026-09-01',10,3)$$,'P0001','NOT_ALLOWED','viewer cannot change individual goals');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
