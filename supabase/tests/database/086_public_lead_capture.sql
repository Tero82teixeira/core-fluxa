BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public','lead_capture_forms','lead capture form table exists');
SELECT has_table('public','lead_capture_submissions','lead capture submission table exists');
SELECT ok(
  NOT has_table_privilege('anon','public.lead_capture_forms','SELECT')
  AND NOT has_table_privilege('anon','public.lead_capture_submissions','INSERT'),
  'anonymous visitors cannot reach lead tables directly'
);
SELECT ok(
  has_function_privilege('anon','public.get_public_lead_capture_form(uuid)','EXECUTE')
  AND has_function_privilege('anon','public.submit_public_lead(uuid,text,text,text,text,text,text,text,boolean)','EXECUTE'),
  'anonymous visitors only reach the guarded public functions'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
('1d600000-0000-0000-0000-000000000001','lead-manager@fluxa.test','{}','authenticated','authenticated','',now()),
('1d600000-0000-0000-0000-000000000002','lead-viewer@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name,created_by) VALUES
('2d600000-0000-0000-0000-000000000001','Lead Capture Tenant','Equipe Lead','1d600000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2d600000-0000-0000-0000-000000000001','1d600000-0000-0000-0000-000000000001','gestor',true),
('2d600000-0000-0000-0000-000000000001','1d600000-0000-0000-0000-000000000002','visualizador',true);
UPDATE public.profiles SET full_name='Gestora Comercial' WHERE id='1d600000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1d600000-0000-0000-0000-000000000001',true);
SELECT lives_ok(
  $$SELECT public.save_lead_capture_form('2d600000-0000-0000-0000-000000000001','Solicite uma proposta','Conte o que sua empresa precisa.','Recebemos seu pedido.',true,false)$$,
  'manager creates the public form'
);
SELECT is((SELECT is_active::text || '|' || title FROM public.lead_capture_forms WHERE organization_id='2d600000-0000-0000-0000-000000000001'),'true|Solicite uma proposta','form configuration is persisted');

SELECT set_config('request.jwt.claim.sub','1d600000-0000-0000-0000-000000000002',true);
SELECT throws_ok(
  $$SELECT public.save_lead_capture_form('2d600000-0000-0000-0000-000000000001','Título proibido','Descrição proibida','Mensagem proibida',true,false)$$,
  'P0001','NOT_ALLOWED','viewer cannot manage the public form'
);
SELECT set_config(
  'test.lead_capture_token',
  (SELECT public_token::text FROM public.lead_capture_forms WHERE organization_id='2d600000-0000-0000-0000-000000000001'),
  true
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT is(
  (SELECT organization_name FROM public.get_public_lead_capture_form(current_setting('test.lead_capture_token')::uuid)),
  'Equipe Lead','public metadata exposes the display name only'
);
SELECT lives_ok(
  $$SELECT public.submit_public_lead(
    current_setting('test.lead_capture_token')::uuid,
    'Maria Interessada','MARIA@EXAMPLE.COM','(11) 99999-0000','Empresa Maria','Preciso organizar meus processos.','instagram',NULL,true
  )$$,
  'visitor submits a valid lead'
);
SELECT throws_ok(
  $$SELECT public.submit_public_lead(
    current_setting('test.lead_capture_token')::uuid,
    'Sem contato',NULL,NULL,NULL,NULL,'link',NULL,true
  )$$,
  'P0001','LEAD_CONTACT_REQUIRED','a return contact is required'
);

RESET ROLE;
SELECT is((SELECT status::text || '|' || email || '|' || owner_name FROM public.clients WHERE organization_id='2d600000-0000-0000-0000-000000000001'),'lead|maria@example.com|Gestora Comercial','submission creates and assigns a normalized lead');
SELECT is((SELECT stage || '|' || probability::text FROM public.commercial_opportunities WHERE organization_id='2d600000-0000-0000-0000-000000000001'),'first_contact|10','submission opens the first commercial opportunity');
SELECT is((SELECT source FROM public.lead_capture_submissions WHERE organization_id='2d600000-0000-0000-0000-000000000001'),'instagram','submission origin is retained');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE organization_id='2d600000-0000-0000-0000-000000000001' AND title='Novo lead recebido'),1,'the responsible manager is notified');

SET LOCAL ROLE anon;
SELECT lives_ok(
  $$SELECT public.submit_public_lead(
    current_setting('test.lead_capture_token')::uuid,
    'Maria Interessada','maria@example.com','11999990000',NULL,NULL,'link',NULL,true
  )$$,
  'immediate duplicate receives a neutral success response'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.lead_capture_submissions WHERE organization_id='2d600000-0000-0000-0000-000000000001'),1,'immediate duplicate is not stored twice');

SELECT set_config('request.jwt.claim.sub','1d600000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.save_lead_capture_form('2d600000-0000-0000-0000-000000000001','Solicite uma proposta','Conte o que sua empresa precisa.','Recebemos seu pedido.',false,false)$$,
  'manager can pause the public form'
);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT * FROM public.get_public_lead_capture_form(current_setting('test.lead_capture_token')::uuid)$$,
  'paused form is no longer publicly discoverable'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
