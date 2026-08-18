BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(39);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('11000000-0000-0000-0000-000000000001','rls-owner@fluxa.test','{}','authenticated','authenticated','',now()),
 ('11000000-0000-0000-0000-000000000002','rls-admin@fluxa.test','{}','authenticated','authenticated','',now()),
 ('11000000-0000-0000-0000-000000000003','rls-operator@fluxa.test','{}','authenticated','authenticated','',now()),
 ('11000000-0000-0000-0000-000000000004','rls-viewer@fluxa.test','{}','authenticated','authenticated','',now()),
 ('11000000-0000-0000-0000-000000000005','rls-outsider@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('21000000-0000-0000-0000-000000000001','RLS A Ltda','RLS A'),
 ('21000000-0000-0000-0000-000000000002','RLS B Ltda','RLS B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','proprietario',true),
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','administrador',true),
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000003','operacional',true),
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000004','visualizador',true),
 ('21000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000005','proprietario',true);
INSERT INTO public.process_stages(id,organization_id,key,label,position) VALUES
 ('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','novo','A',1),
 ('31000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','novo','B',1);
INSERT INTO public.service_types(id,organization_id,name) VALUES
 ('41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Serviço A'),
 ('41000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','Serviço B');
INSERT INTO public.tasks(id,organization_id,title) VALUES
 ('51000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Tarefa A'),
 ('51000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','Tarefa B');
INSERT INTO public.task_history(id,organization_id,task_id,action) VALUES
 ('61000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','seed-a'),
 ('61000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002','seed-b');

SELECT ok(NOT has_table_privilege('authenticated','public.task_history','INSERT'),'authenticated sem INSERT direto em task_history');
SELECT ok(NOT has_table_privilege('authenticated','public.task_history','UPDATE'),'authenticated sem UPDATE direto em task_history');
SELECT ok(NOT has_table_privilege('authenticated','public.task_history','DELETE'),'authenticated sem DELETE direto em task_history');
SELECT ok(NOT has_table_privilege('anon','public.task_history','INSERT'),'anon sem INSERT direto em task_history');
SELECT ok(NOT has_table_privilege('anon','public.task_history','UPDATE'),'anon sem UPDATE direto em task_history');
SELECT ok(NOT has_table_privilege('anon','public.task_history','DELETE'),'anon sem DELETE direto em task_history');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
SELECT is((SELECT count(*) FROM public.process_stages),1::bigint,'membro vê etapas da própria organização e não de outra');
SELECT is((SELECT count(*) FROM public.service_types),1::bigint,'membro vê tipos da própria organização e não de outra');
SELECT is((SELECT count(*) FROM public.task_history),1::bigint,'membro vê histórico da tarefa da própria organização e não de outra');
SELECT lives_ok($$INSERT INTO public.process_stages(organization_id,key,label) VALUES ('21000000-0000-0000-0000-000000000001','montagem','Owner')$$,'proprietario insere etapa');
SELECT lives_ok($$UPDATE public.process_stages SET label='Owner atualizado' WHERE organization_id='21000000-0000-0000-0000-000000000001' AND key='montagem'$$,'proprietario atualiza etapa');
SELECT lives_ok($$DELETE FROM public.process_stages WHERE organization_id='21000000-0000-0000-0000-000000000001' AND key='montagem'$$,'proprietario exclui etapa');
SELECT lives_ok($$INSERT INTO public.service_types(organization_id,name) VALUES ('21000000-0000-0000-0000-000000000001','Owner')$$,'proprietario insere tipo');
SELECT lives_ok($$UPDATE public.service_types SET name='Owner atualizado' WHERE organization_id='21000000-0000-0000-0000-000000000001' AND name='Owner'$$,'proprietario atualiza tipo');
SELECT lives_ok($$DELETE FROM public.service_types WHERE organization_id='21000000-0000-0000-0000-000000000001' AND name='Owner atualizado'$$,'proprietario exclui tipo');
SELECT throws_ok($$INSERT INTO public.process_stages(organization_id,key,label) VALUES ('21000000-0000-0000-0000-000000000002','montagem','Cross')$$,'42501',NULL,'proprietario não insere etapa cross-org');
SELECT throws_ok($$INSERT INTO public.service_types(organization_id,name) VALUES ('21000000-0000-0000-0000-000000000002','Cross')$$,'42501',NULL,'proprietario não insere tipo cross-org');
SELECT throws_ok($$INSERT INTO public.task_history(organization_id,task_id,action) VALUES ('21000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','direto')$$,'42501','permission denied for table task_history','INSERT direto authenticated falha');

SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000005',true);
SELECT is((SELECT count(*) FROM public.process_stages WHERE organization_id='21000000-0000-0000-0000-000000000001'),0::bigint,'usuário de outra organização não vê etapas');
SELECT is((SELECT count(*) FROM public.service_types WHERE organization_id='21000000-0000-0000-0000-000000000001'),0::bigint,'usuário de outra organização não vê tipos');
SELECT is((SELECT count(*) FROM public.task_history WHERE organization_id='21000000-0000-0000-0000-000000000001'),0::bigint,'usuário de outra organização não vê histórico');

SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT lives_ok($$INSERT INTO public.process_stages(organization_id,key,label) VALUES ('21000000-0000-0000-0000-000000000001','em_analise','Admin')$$,'administrador insere etapa');
SELECT lives_ok($$UPDATE public.process_stages SET label='Admin atualizado' WHERE key='em_analise'$$,'administrador atualiza etapa');
SELECT lives_ok($$DELETE FROM public.process_stages WHERE key='em_analise'$$,'administrador exclui etapa');
SELECT lives_ok($$INSERT INTO public.service_types(organization_id,name) VALUES ('21000000-0000-0000-0000-000000000001','Admin')$$,'administrador insere tipo');
SELECT lives_ok($$UPDATE public.service_types SET name='Admin atualizado' WHERE name='Admin'$$,'administrador atualiza tipo');
SELECT lives_ok($$DELETE FROM public.service_types WHERE name='Admin atualizado'$$,'administrador exclui tipo');

SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000003',true);
SELECT throws_ok($$INSERT INTO public.process_stages(organization_id,key,label) VALUES ('21000000-0000-0000-0000-000000000001','montagem','Operacional')$$,'42501',NULL,'operacional não insere etapa');
SELECT is((WITH changed AS (UPDATE public.process_stages SET label='Operacional' RETURNING 1) SELECT count(*) FROM changed),0::bigint,'operacional não atualiza etapa');
SELECT is((WITH removed AS (DELETE FROM public.process_stages RETURNING 1) SELECT count(*) FROM removed),0::bigint,'operacional não exclui etapa');
SELECT throws_ok($$INSERT INTO public.service_types(organization_id,name) VALUES ('21000000-0000-0000-0000-000000000001','Operacional')$$,'42501',NULL,'operacional não insere tipo');
SELECT is((WITH changed AS (UPDATE public.service_types SET name='Operacional' RETURNING 1) SELECT count(*) FROM changed),0::bigint,'operacional não atualiza tipo');
SELECT is((WITH removed AS (DELETE FROM public.service_types RETURNING 1) SELECT count(*) FROM removed),0::bigint,'operacional não exclui tipo');

SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000004',true);
SELECT throws_ok($$INSERT INTO public.process_stages(organization_id,key,label) VALUES ('21000000-0000-0000-0000-000000000001','montagem','Viewer')$$,'42501',NULL,'visualizador não insere etapa');
SELECT is((WITH changed AS (UPDATE public.process_stages SET label='Viewer' RETURNING 1) SELECT count(*) FROM changed),0::bigint,'visualizador não atualiza etapa');
SELECT is((WITH removed AS (DELETE FROM public.process_stages RETURNING 1) SELECT count(*) FROM removed),0::bigint,'visualizador não exclui etapa');
SELECT throws_ok($$INSERT INTO public.service_types(organization_id,name) VALUES ('21000000-0000-0000-0000-000000000001','Viewer')$$,'42501',NULL,'visualizador não insere tipo');
SELECT is((WITH changed AS (UPDATE public.service_types SET name='Viewer' RETURNING 1) SELECT count(*) FROM changed),0::bigint,'visualizador não atualiza tipo');
SELECT is((WITH removed AS (DELETE FROM public.service_types RETURNING 1) SELECT count(*) FROM removed),0::bigint,'visualizador não exclui tipo');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
