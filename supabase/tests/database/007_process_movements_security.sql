BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('17000000-0000-0000-0000-000000000001','movement-member@fluxa.test','{"full_name":"Untrusted JWT Name"}','authenticated','authenticated','',now()),
 ('17000000-0000-0000-0000-000000000002','movement-outsider@fluxa.test','{"full_name":"Outsider"}','authenticated','authenticated','',now());
UPDATE public.profiles SET full_name='Trusted Movement Actor' WHERE id='17000000-0000-0000-0000-000000000001';
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('27000000-0000-0000-0000-000000000001','Movement A Ltda','Movement A'),
 ('27000000-0000-0000-0000-000000000002','Movement B Ltda','Movement B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('27000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','operacional',true),
 ('27000000-0000-0000-0000-000000000002','17000000-0000-0000-0000-000000000002','operacional',true);
INSERT INTO public.clients(id,organization_id,name) VALUES
 ('37000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','Cliente A'),
 ('37000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000002','Cliente B');
INSERT INTO public.processes(id,organization_id,code,client_id,title,stage) VALUES
 ('47000000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','MOV-1','37000000-0000-0000-0000-000000000001','Processo A','novo'),
 ('47000000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000002','MOV-2','37000000-0000-0000-0000-000000000002','Processo B','novo');
INSERT INTO public.process_movements(organization_id,process_id,description,actor_name,created_by) VALUES
 ('27000000-0000-0000-0000-000000000002','47000000-0000-0000-0000-000000000002','Movimento B','System',NULL);

SELECT ok(NOT has_table_privilege('authenticated','public.process_movements','INSERT'),'authenticated não possui INSERT direto');
SELECT ok(NOT has_table_privilege('anon','public.process_movements','INSERT'),'anon não possui INSERT');
SELECT ok(NOT has_table_privilege('anon','public.process_movements','UPDATE'),'anon não possui UPDATE');
SELECT ok(NOT has_table_privilege('anon','public.process_movements','DELETE'),'anon não possui DELETE');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','17000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($$SELECT public.record_process_movement('27000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','  Anotação segura  ',NULL,'montagem')$$,'membro ativo registra na própria organização');
SELECT is((SELECT created_by FROM public.process_movements WHERE description='Anotação segura'),'17000000-0000-0000-0000-000000000001'::uuid,'created_by é auth.uid()');
SELECT is((SELECT actor_name FROM public.process_movements WHERE description='Anotação segura'),'Trusted Movement Actor','actor_name vem de profiles');
SELECT throws_ok($$SELECT public.record_process_movement('27000000-0000-0000-0000-000000000002','47000000-0000-0000-0000-000000000002','Falsificação')$$,'42501','PROCESS_MOVEMENT_ORGANIZATION_ACCESS_DENIED','usuário não registra em outra organização');
SELECT throws_ok($$SELECT public.record_process_movement('27000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000002','Processo cruzado')$$,'42501','PROCESS_MOVEMENT_PROCESS_ORGANIZATION_MISMATCH','processo deve pertencer à organização informada');
SELECT throws_ok($$INSERT INTO public.process_movements(organization_id,process_id,description) VALUES('27000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','Direto')$$,'42501','permission denied for table process_movements','INSERT direto é rejeitado');
SELECT throws_ok($$UPDATE public.process_movements SET description='Alterado' WHERE process_id='47000000-0000-0000-0000-000000000001'$$,'42501','permission denied for table process_movements','UPDATE direto permanece rejeitado');
SELECT throws_ok($$DELETE FROM public.process_movements WHERE process_id='47000000-0000-0000-0000-000000000001'$$,'42501','permission denied for table process_movements','DELETE direto permanece rejeitado');
SELECT is((SELECT count(*) FROM public.process_movements),1::bigint,'SELECT permanece isolado à própria organização');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT public.record_process_movement('27000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000001','Sem autenticação')$$,'42501','PROCESS_MOVEMENT_AUTHENTICATION_REQUIRED','RPC sem autenticação é rejeitada');

RESET ROLE;
INSERT INTO public.automation_rules(organization_id,name,trigger_type,conditions,action_type,action_config,is_active,created_by) VALUES
 ('27000000-0000-0000-0000-000000000001','Checklist interno','process.stage_changed','[]','create_checklist_item','{"title":"Gerado internamente"}',true,'17000000-0000-0000-0000-000000000001');
SELECT is(public.process_automation_event('27000000-0000-0000-0000-000000000001','process.stage_changed','process','47000000-0000-0000-0000-000000000001','{"stage":"montagem","from_stage":"novo","to_stage":"montagem"}',NULL,0,'movement-hardening'),1,'automação SECURITY DEFINER executa após revogação');
SELECT ok(EXISTS(SELECT 1 FROM public.process_movements WHERE process_id='47000000-0000-0000-0000-000000000001' AND actor_name='Automação' AND description LIKE '%Gerado internamente%'),'automação continua inserindo movimentação interna');

SELECT * FROM finish();
ROLLBACK;
