BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(6);

SELECT has_function(
  'public',
  'tasks_sync_assignee_name',
  ARRAY[]::text[],
  'função de sincronização existe'
);
SELECT trigger_is(
  'public',
  'tasks',
  'tasks_sync_assignee_name_trg',
  'public',
  'tasks_sync_assignee_name',
  'trigger de sincronização existe em public.tasks'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('14000000-0000-0000-0000-000000000001','first-assignee@fluxa.test','{"full_name":"Primeira Pessoa"}','authenticated','authenticated','',now()),
 ('14000000-0000-0000-0000-000000000002','second-assignee@fluxa.test','{"full_name":"Segunda Pessoa"}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('24000000-0000-0000-0000-000000000001','Assignee Sync Ltda','Assignee Sync');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('24000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','proprietario',true),
 ('24000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000002','operacional',true);

INSERT INTO public.tasks(id,organization_id,title,assignee_id,assignee_name,created_by) VALUES
 ('34000000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','Validar responsável','14000000-0000-0000-0000-000000000001',NULL,'14000000-0000-0000-0000-000000000001');
SELECT is(
  (SELECT assignee_name FROM public.tasks WHERE id = '34000000-0000-0000-0000-000000000001'),
  'Primeira Pessoa',
  'insert preenche o nome a partir do perfil'
);

UPDATE public.tasks
SET assignee_id = '14000000-0000-0000-0000-000000000002'
WHERE id = '34000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT assignee_name FROM public.tasks WHERE id = '34000000-0000-0000-0000-000000000001'),
  'Segunda Pessoa',
  'alterar responsável atualiza o nome'
);

UPDATE public.tasks
SET assignee_id = NULL
WHERE id = '34000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT assignee_name FROM public.tasks WHERE id = '34000000-0000-0000-0000-000000000001'),
  NULL,
  'remover responsável limpa o nome'
);

SELECT ok(
  to_regprocedure('public.process_automation_event(uuid,text,text,uuid,jsonb,uuid,integer,text)') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.tasks'::regclass
        AND tgname = 'tasks_automation_events'
        AND NOT tgisinternal
    ),
  'automação existente de tarefas permanece instalada'
);

SELECT * FROM finish();
ROLLBACK;
