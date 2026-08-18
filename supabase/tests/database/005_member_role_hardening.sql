BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('15000000-0000-0000-0000-000000000001','owner-role@fluxa.test','{"full_name":"Owner"}','authenticated','authenticated','',now()),
 ('15000000-0000-0000-0000-000000000002','admin-role@fluxa.test','{"full_name":"Admin"}','authenticated','authenticated','',now()),
 ('15000000-0000-0000-0000-000000000003','member-role@fluxa.test','{"full_name":"Member"}','authenticated','authenticated','',now()),
 ('15000000-0000-0000-0000-000000000004','other-owner-role@fluxa.test','{"full_name":"Other Owner"}','authenticated','authenticated','',now()),
 ('15000000-0000-0000-0000-000000000005','other-member-role@fluxa.test','{"full_name":"Other Member"}','authenticated','authenticated','',now());

INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('25000000-0000-0000-0000-000000000001','Role Hardening A Ltda','Role Hardening A'),
 ('25000000-0000-0000-0000-000000000002','Role Hardening B Ltda','Role Hardening B');

INSERT INTO public.organization_members(id,organization_id,user_id,role,is_active) VALUES
 ('35000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001','proprietario',true),
 ('35000000-0000-0000-0000-000000000002','25000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000002','administrador',true),
 ('35000000-0000-0000-0000-000000000003','25000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000003','operacional',true),
 ('35000000-0000-0000-0000-000000000004','25000000-0000-0000-0000-000000000002','15000000-0000-0000-0000-000000000004','proprietario',true),
 ('35000000-0000-0000-0000-000000000005','25000000-0000-0000-0000-000000000002','15000000-0000-0000-0000-000000000005','operacional',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($$SELECT public.change_member_role('35000000-0000-0000-0000-000000000003','gestor')$$,
  'proprietario altera papel permitido pela RPC');
SELECT is((SELECT role::text FROM public.organization_members WHERE id='35000000-0000-0000-0000-000000000003'),'gestor',
  'alteracao legitima via RPC persiste');

SELECT set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000002',true);
SELECT lives_ok($$SELECT public.change_member_role('35000000-0000-0000-0000-000000000003','operacional')$$,
  'administrador realiza alteracao permitida');
SELECT throws_ok($$SELECT public.change_member_role('35000000-0000-0000-0000-000000000003','proprietario')$$,
  'P0001','NOT_ALLOWED','administrador nao promove para proprietario');
SELECT throws_ok($$SELECT public.change_member_role('35000000-0000-0000-0000-000000000003','administrador')$$,
  'P0001','NOT_ALLOWED','administrador nao promove para administrador');
SELECT throws_ok($$SELECT public.change_member_role('35000000-0000-0000-0000-000000000002','gestor')$$,
  'P0001','CANNOT_CHANGE_OWN_ROLE','usuario nao altera o proprio papel');
SELECT throws_ok($$SELECT public.change_member_role('35000000-0000-0000-0000-000000000005','gestor')$$,
  'P0001','NOT_ALLOWED','usuario nao altera membro de outra organizacao');
SELECT throws_ok($$UPDATE public.organization_members SET role='gestor' WHERE id='35000000-0000-0000-0000-000000000003'$$,
  '42501','permission denied for table organization_members','UPDATE direto e rejeitado pelo privilegio da tabela');
SELECT ok(NOT has_table_privilege('authenticated','public.organization_members','UPDATE'),
  'authenticated nao possui privilegio UPDATE em organization_members');
SELECT is((SELECT count(*) FROM information_schema.role_table_grants
  WHERE grantee='authenticated' AND table_schema='public'
    AND table_name='organization_members' AND privilege_type='UPDATE'),0::bigint,
  'nenhuma permissao UPDATE e concedida a authenticated');

SELECT set_config('request.jwt.claim.sub','15000000-0000-0000-0000-000000000004',true);
SELECT throws_ok($$SELECT public.change_member_role('35000000-0000-0000-0000-000000000004','gestor')$$,
  'P0001','CANNOT_CHANGE_OWN_ROLE','ultimo proprietario nao consegue remover a propria protecao');
SELECT is((SELECT role::text FROM public.organization_members WHERE id='35000000-0000-0000-0000-000000000004'),'proprietario',
  'ultimo proprietario permanece proprietario');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
