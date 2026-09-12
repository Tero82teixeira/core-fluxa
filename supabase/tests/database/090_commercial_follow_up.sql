BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public','platform_trial_follow_ups','platform trial follow-up exists');
SELECT has_table('public','platform_trial_contact_history','platform contact history exists');
SELECT has_table('public','commercial_opportunity_contact_history','tenant contact history exists');
SELECT has_column('public','commercial_opportunities','contact_status','opportunity contact status exists');
SELECT has_column('public','commercial_opportunities','last_contact_at','opportunity last contact exists');
SELECT ok(
  NOT has_table_privilege('authenticated','public.platform_trial_follow_ups','SELECT')
  AND NOT has_table_privilege('authenticated','public.platform_trial_contact_history','SELECT')
  AND NOT has_table_privilege('authenticated','public.commercial_opportunity_contact_history','INSERT'),
  'browser cannot read platform notes or write contact history directly'
);
SELECT ok(
  has_function_privilege('authenticated','public.save_platform_trial_follow_up(uuid,text,timestamptz,text,text,boolean)','EXECUTE')
  AND has_function_privilege('authenticated','public.save_commercial_opportunity_contact(uuid,uuid,text,text,text,timestamptz)','EXECUTE')
  AND NOT has_function_privilege('anon','public.save_platform_trial_follow_up(uuid,text,timestamptz,text,text,boolean)','EXECUTE'),
  'authenticated sessions reach guarded RPCs while public sessions do not'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
('1d900000-0000-0000-0000-000000000001','followup-admin@fluxa.test','{}','authenticated','authenticated','',now()),
('1d900000-0000-0000-0000-000000000002','followup-trial@fluxa.test','{}','authenticated','authenticated','',now()),
('1d900000-0000-0000-0000-000000000003','followup-manager@fluxa.test','{}','authenticated','authenticated','',now()),
('1d900000-0000-0000-0000-000000000004','followup-viewer@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.profiles(id,full_name,email) VALUES
('1d900000-0000-0000-0000-000000000001','Admin de testes','followup-admin@fluxa.test'),
('1d900000-0000-0000-0000-000000000002','Empresa em teste','followup-trial@fluxa.test'),
('1d900000-0000-0000-0000-000000000003','Gestor comercial','followup-manager@fluxa.test'),
('1d900000-0000-0000-0000-000000000004','Visualizador','followup-viewer@fluxa.test')
ON CONFLICT (id) DO UPDATE SET full_name=excluded.full_name;
INSERT INTO public.organizations(
  id,legal_name,trade_name,created_by,commercial_status,trial_started_at,trial_ends_at,whatsapp
) VALUES
('2d900000-0000-0000-0000-000000000001','Empresa Avaliação Ltda','Empresa Avaliação','1d900000-0000-0000-0000-000000000002','trial',now(),now()+interval '10 days','27999998888'),
('2d900000-0000-0000-0000-000000000002','Escritório Cliente Ltda','Escritório Cliente','1d900000-0000-0000-0000-000000000003','active',NULL,NULL,NULL);
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2d900000-0000-0000-0000-000000000001','1d900000-0000-0000-0000-000000000002','proprietario',true),
('2d900000-0000-0000-0000-000000000002','1d900000-0000-0000-0000-000000000003','gestor',true),
('2d900000-0000-0000-0000-000000000002','1d900000-0000-0000-0000-000000000004','visualizador',true);
INSERT INTO public.platform_admins(user_id,created_by) VALUES
('1d900000-0000-0000-0000-000000000001','1d900000-0000-0000-0000-000000000001');
INSERT INTO public.commercial_opportunities(
  id,organization_id,title,stage,estimated_value,probability,owner_id,created_by,updated_by
) VALUES (
  '3d900000-0000-0000-0000-000000000001','2d900000-0000-0000-0000-000000000002',
  'Contabilidade mensal','qualification',500,25,'1d900000-0000-0000-0000-000000000003',
  '1d900000-0000-0000-0000-000000000003','1d900000-0000-0000-0000-000000000003'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1d900000-0000-0000-0000-000000000002',true);
SELECT throws_ok(
  $$SELECT public.save_platform_trial_follow_up(
    '2d900000-0000-0000-0000-000000000001','following',now()+interval '1 day','Contato','phone',true
  )$$,
  '42501','PLATFORM_ADMIN_REQUIRED','tenant owner cannot edit platform follow-up'
);

SELECT set_config('request.jwt.claim.sub','1d900000-0000-0000-0000-000000000001',true);
SELECT lives_ok(
  $$SELECT public.save_platform_trial_follow_up(
    '2d900000-0000-0000-0000-000000000001','interested',now()+interval '2 days',
    'Solicitou demonstração para a equipe','whatsapp',true
  )$$,
  'platform administrator records a trial contact'
);
SELECT is(
  (SELECT follow_up_status FROM public.platform_organizations()
    WHERE organization_id='2d900000-0000-0000-0000-000000000001'),
  'interested','platform radar returns the current follow-up status'
);
SELECT is(
  (SELECT count(*) FROM public.platform_trial_contact_history('2d900000-0000-0000-0000-000000000001')),
  1::bigint,'platform contact remains in history'
);

SELECT set_config('request.jwt.claim.sub','1d900000-0000-0000-0000-000000000003',true);
SELECT lives_ok(
  $$SELECT public.save_commercial_opportunity_contact(
    '2d900000-0000-0000-0000-000000000002','3d900000-0000-0000-0000-000000000001',
    'following','email','Cliente pediu retorno na sexta-feira',now()+interval '3 days'
  )$$,
  'tenant manager records a scoped opportunity contact'
);
SELECT is(
  (SELECT contact_status FROM public.commercial_opportunities
    WHERE id='3d900000-0000-0000-0000-000000000001'),
  'following','contact updates the opportunity status'
);
SELECT is(
  (SELECT count(*) FROM public.commercial_opportunity_contacts(
    '2d900000-0000-0000-0000-000000000002','3d900000-0000-0000-0000-000000000001'
  )),
  1::bigint,'tenant sees its own contact history through the guarded RPC'
);

SELECT set_config('request.jwt.claim.sub','1d900000-0000-0000-0000-000000000004',true);
SELECT throws_ok(
  $$SELECT public.save_commercial_opportunity_contact(
    '2d900000-0000-0000-0000-000000000002','3d900000-0000-0000-0000-000000000001',
    'interested','phone','Tentativa sem permissão',NULL
  )$$,
  '42501','NOT_ALLOWED','viewer cannot write commercial history'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
