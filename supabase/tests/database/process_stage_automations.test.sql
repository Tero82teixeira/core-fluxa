BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(27);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('13000000-0000-0000-0000-000000000001','owner-auto@fluxa.test','{"full_name":"Owner"}','authenticated','authenticated','',now()),
 ('13000000-0000-0000-0000-000000000002','operator-auto@fluxa.test','{"full_name":"Operator"}','authenticated','authenticated','',now()),
 ('13000000-0000-0000-0000-000000000003','outsider-auto@fluxa.test','{"full_name":"Outsider"}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('23000000-0000-0000-0000-000000000001','Automation A Ltda','Automation A'),
 ('23000000-0000-0000-0000-000000000002','Automation B Ltda','Automation B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','proprietario',true),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000002','operacional',true),
 ('23000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000003','proprietario',true);
INSERT INTO public.clients(id,organization_id,name) VALUES
 ('33000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','Cliente A'),
 ('33000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000002','Cliente B');
INSERT INTO public.processes(id,organization_id,code,client_id,title,stage,owner_id) VALUES
 ('43000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','AUTO-1','33000000-0000-0000-0000-000000000001','Processo A','novo','13000000-0000-0000-0000-000000000002'),
 ('43000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000002','AUTO-2','33000000-0000-0000-0000-000000000002','Processo B','novo','13000000-0000-0000-0000-000000000003');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($$SELECT public.create_automation_rule('23000000-0000-0000-0000-000000000001','Solicitar documentação',NULL,'process.stage_changed','[{"field":"to_stage","operator":"equals","value":"aguardando_documentos"}]','create_task','{"title":"Solicitar documentos","priority":"alta","status":"em_andamento","due_in_days":3,"assignee_mode":"process_owner"}',true)$$,'proprietário cria regra');
SELECT throws_ok($$SELECT public.create_automation_rule('23000000-0000-0000-0000-000000000001','Checklist de tarefa',NULL,'task.created','[]','create_checklist_item','{"title":"Inválido"}',false)$$,'P0001','CHECKLIST_ACTION_REQUIRES_PROCESS_TRIGGER','task.created rejeita checklist');
SELECT throws_ok($$SELECT public.create_automation_rule('23000000-0000-0000-0000-000000000001','Checklist de monitoramento',NULL,'monitoring.created','[]','create_checklist_item','{"title":"Inválido"}',false)$$,'P0001','CHECKLIST_ACTION_REQUIRES_PROCESS_TRIGGER','monitoring.created rejeita checklist');
SELECT lives_ok($$SELECT public.create_automation_rule('23000000-0000-0000-0000-000000000001','Checklist de processo permitido',NULL,'process.stage_changed','[{"field":"to_stage","operator":"equals","value":"finalizado"}]','create_checklist_item','{"title":"Válido"}',false)$$,'process.stage_changed permite checklist');
SELECT throws_ok($$SELECT public.create_automation_rule('23000000-0000-0000-0000-000000000001','Owner sem processo',NULL,'task.created','[]','create_task','{"title":"Inválido","assignee_mode":"process_owner"}',false)$$,'P0001','PROCESS_OWNER_REQUIRES_PROCESS','task.created rejeita process_owner sem processo');
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
SELECT throws_ok($$SELECT public.create_automation_rule('23000000-0000-0000-0000-000000000001','Proibida',NULL,'process.stage_changed','[]','add_audit_log','{"message":"x"}',true)$$,'P0001','NOT_ALLOWED','operacional não cria regra');
RESET ROLE;

UPDATE public.processes SET stage='aguardando_documentos' WHERE id='43000000-0000-0000-0000-000000000001';
SELECT is((SELECT count(*) FROM public.tasks WHERE process_id='43000000-0000-0000-0000-000000000001' AND title='Solicitar documentos'),1::bigint,'mudança cria exatamente uma tarefa');
SELECT is((SELECT organization_id FROM public.tasks WHERE title='Solicitar documentos'),'23000000-0000-0000-0000-000000000001'::uuid,'tarefa herda organização');
SELECT is((SELECT process_id FROM public.tasks WHERE title='Solicitar documentos'),'43000000-0000-0000-0000-000000000001'::uuid,'tarefa herda processo');
SELECT is((SELECT client_id FROM public.tasks WHERE title='Solicitar documentos'),'33000000-0000-0000-0000-000000000001'::uuid,'tarefa herda cliente');
SELECT is((SELECT assignee_id FROM public.tasks WHERE title='Solicitar documentos'),'13000000-0000-0000-0000-000000000002'::uuid,'process_owner herda owner');
SELECT is((SELECT due_at::date FROM public.tasks WHERE title='Solicitar documentos'),current_date+3,'prazo é calculado');
SELECT is((SELECT priority::text FROM public.tasks WHERE title='Solicitar documentos'),'alta','prioridade aplicada');
SELECT is((SELECT status::text FROM public.tasks WHERE title='Solicitar documentos'),'em_andamento','status inicial aplicado');
SELECT ok(EXISTS(SELECT 1 FROM public.process_movements WHERE process_id='43000000-0000-0000-0000-000000000001' AND actor_name='Automação' AND description LIKE '%Solicitar documentos%'),'movimentação automática criada');
SELECT is((SELECT status::text FROM public.automation_executions WHERE entity_id='43000000-0000-0000-0000-000000000001' AND event_type='process.stage_changed' AND input_payload->>'to_stage'='aguardando_documentos'),'success','execução termina success');
SELECT ok((SELECT length(dedupe_key)=64 AND dedupe_key ~ '^[0-9a-f]{64}$' FROM public.automation_executions WHERE entity_id='43000000-0000-0000-0000-000000000001' AND event_type='process.stage_changed' AND input_payload->>'to_stage'='aguardando_documentos'),'dedupe usa SHA-256 hexadecimal qualificado');
UPDATE public.processes SET stage='montagem' WHERE id='43000000-0000-0000-0000-000000000001';
SELECT is((SELECT status::text FROM public.automation_executions WHERE entity_id='43000000-0000-0000-0000-000000000001' AND event_type='process.stage_changed' AND input_payload->>'to_stage'='montagem'),'skipped','outra etapa é skipped');
UPDATE public.processes SET title='Sem mudança de etapa' WHERE id='43000000-0000-0000-0000-000000000001';
SELECT is((SELECT count(*) FROM public.automation_executions WHERE entity_id='43000000-0000-0000-0000-000000000001'),2::bigint,'outro campo não emite evento de etapa');

INSERT INTO public.automation_rules(organization_id,name,trigger_type,conditions,action_type,action_config,is_active,created_by) VALUES
 ('23000000-0000-0000-0000-000000000001','Cross org','process.stage_changed','[{"field":"to_stage","operator":"equals","value":"protocolado"}]','create_task','{"title":"Cross org","assignee_mode":"fixed_user","assignee_id":"13000000-0000-0000-0000-000000000003"}',true,'13000000-0000-0000-0000-000000000001'),
 ('23000000-0000-0000-0000-000000000001','Checklist','process.stage_changed','[{"field":"to_stage","operator":"equals","value":"protocolado"}]','create_checklist_item','{"title":"Documento de identificação","required":true,"due_in_days":3}',true,'13000000-0000-0000-0000-000000000001'),
 ('23000000-0000-0000-0000-000000000001','Legada','process.stage_changed','[{"field":"stage","operator":"equals","value":"protocolado"}]','add_audit_log','{"message":"compatível"}',true,'13000000-0000-0000-0000-000000000001');
UPDATE public.processes SET stage='protocolado' WHERE id='43000000-0000-0000-0000-000000000001';
SELECT ok(EXISTS(SELECT 1 FROM public.automation_executions e JOIN public.automation_rules r ON r.id=e.automation_rule_id WHERE r.name='Cross org' AND e.status='failed'),'fixed_user cross-org falha');
SELECT ok(EXISTS(SELECT 1 FROM public.process_checklist_items WHERE process_id='43000000-0000-0000-0000-000000000001' AND organization_id='23000000-0000-0000-0000-000000000001' AND title='Documento de identificação'),'checklist criado no processo e organização corretos');
SELECT ok((SELECT status::text='pendente' AND required AND due_date=current_date+3 AND position=1 FROM public.process_checklist_items WHERE title='Documento de identificação'),'checklist recebe status, obrigatoriedade, prazo e posição');
SELECT ok(NOT EXISTS(SELECT 1 FROM public.process_checklist_items WHERE process_id='43000000-0000-0000-0000-000000000002' AND organization_id='23000000-0000-0000-0000-000000000001'),'checklist não cruza organização');
SELECT ok(EXISTS(SELECT 1 FROM public.audit_logs WHERE action='automation.action' AND metadata->>'message'='compatível'),'condição legada stage funciona');

INSERT INTO public.automation_rules(organization_id,name,trigger_type,conditions,action_type,action_config,is_active,created_by) VALUES
 ('23000000-0000-0000-0000-000000000001','Auditoria legada','task.created','[]','add_audit_log','{"message":"task.created preservado"}',true,'13000000-0000-0000-0000-000000000001');
INSERT INTO public.tasks(organization_id,title,created_by) VALUES ('23000000-0000-0000-0000-000000000001','Tarefa manual compatível','13000000-0000-0000-0000-000000000001');
SELECT ok(EXISTS(SELECT 1 FROM public.audit_logs WHERE action='automation.action' AND metadata->>'message'='task.created preservado'),'task.created com add_audit_log continua funcionando');

INSERT INTO public.automation_rules(organization_id,name,trigger_type,conditions,action_type,action_config,is_active,created_by) VALUES
 ('23000000-0000-0000-0000-000000000001','Dedupe explícito','process.stage_changed','[]','add_audit_log','{"message":"dedupe explícito"}',true,'13000000-0000-0000-0000-000000000001');
SELECT public.process_automation_event('23000000-0000-0000-0000-000000000001','process.stage_changed','process','43000000-0000-0000-0000-000000000001','{"stage":"montagem","from_stage":"protocolado","to_stage":"montagem"}',NULL,0,'replay-1');
SELECT public.process_automation_event('23000000-0000-0000-0000-000000000001','process.stage_changed','process','43000000-0000-0000-0000-000000000001','{"stage":"montagem","from_stage":"protocolado","to_stage":"montagem"}',NULL,0,'replay-1');
SELECT is((SELECT count(*) FROM public.automation_executions e JOIN public.automation_rules r ON r.id=e.automation_rule_id WHERE r.name='Dedupe explícito'),1::bigint,'replay com a mesma event_version é deduplicado');
SELECT public.process_automation_event('23000000-0000-0000-0000-000000000001','process.stage_changed','process','43000000-0000-0000-0000-000000000001','{"stage":"montagem","from_stage":"protocolado","to_stage":"montagem"}',NULL,0,'replay-2');
SELECT is((SELECT count(*) FROM public.automation_executions e JOIN public.automation_rules r ON r.id=e.automation_rule_id WHERE r.name='Dedupe explícito'),2::bigint,'event_version diferente permite nova execução');

SELECT * FROM finish();
ROLLBACK;
