BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

-- Table privilege contract.
SELECT ok(NOT has_table_privilege('authenticated', 'public.organizations', privilege),
  'authenticated organizations has no ' || privilege)
FROM unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) privilege;
SELECT ok(NOT has_table_privilege('authenticated', 'public.organization_members', privilege),
  'authenticated organization_members has no ' || privilege)
FROM unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES','INSERT','UPDATE','DELETE']) privilege;
SELECT ok(NOT has_table_privilege('authenticated', 'public.organization_invitations', privilege),
  'authenticated organization_invitations has no ' || privilege)
FROM unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) privilege;
SELECT ok(NOT has_table_privilege('authenticated', 'public.profiles', privilege),
  'authenticated profiles has no ' || privilege)
FROM unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) privilege;
SELECT ok(NOT has_table_privilege('anon', 'public.organization_invitations', privilege),
  'anon invitation table has no ' || privilege)
FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) privilege;

SELECT ok(has_table_privilege('authenticated', 'public.organizations', 'SELECT'), 'organizations SELECT remains');
SELECT ok(NOT has_table_privilege('authenticated', 'public.organizations', 'UPDATE'), 'organizations UPDATE is mediated by reviewed RPCs');
SELECT ok(has_table_privilege('authenticated', 'public.organization_members', 'SELECT'), 'members SELECT remains');
SELECT ok(has_table_privilege('authenticated', 'public.organization_invitations', 'SELECT'), 'invitations SELECT remains');
SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'profiles SELECT remains');
SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'profiles INSERT remains');
SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'profiles UPDATE remains');

SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='organization_members' AND cmd='INSERT'), 0::bigint, 'no member INSERT policy');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='organization_members' AND cmd='UPDATE'), 0::bigint, 'no member UPDATE policy');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='organization_members' AND cmd='DELETE'), 0::bigint, 'no member DELETE policy');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_members' AND cmd='SELECT'), 'member SELECT policy remains');

-- Exact public RPC privilege contract.
SELECT ok(has_function_privilege('authenticated', signature, 'EXECUTE'), 'authenticated executes ' || signature)
FROM unnest(ARRAY[
  'public.bootstrap_organization()', 'public.accept_invitation(text)',
  'public.create_invitation(uuid,text,public.app_role)', 'public.cancel_invitation(uuid)',
  'public.invitation_preview(text)'
]) signature;
SELECT ok(NOT has_function_privilege('anon', signature, 'EXECUTE'), 'anon cannot execute ' || signature)
FROM unnest(ARRAY[
  'public.bootstrap_organization()', 'public.accept_invitation(text)',
  'public.create_invitation(uuid,text,public.app_role)', 'public.cancel_invitation(uuid)'
]) signature;
SELECT ok(has_function_privilege('anon', 'public.invitation_preview(text)', 'EXECUTE'), 'anon executes only invitation preview');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='pending_invitation_diagnostics'
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), 'pending diagnostics is absent or closed to clients');

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('15150000-0000-0000-0000-000000000001','owner15@fluxa.test','{"full_name":"Owner 15"}','authenticated','authenticated','',now()),
 ('15150000-0000-0000-0000-000000000002','admin15@fluxa.test','{}','authenticated','authenticated','',now()),
 ('15150000-0000-0000-0000-000000000003','member15@fluxa.test','{}','authenticated','authenticated','',now()),
 ('15150000-0000-0000-0000-000000000004','other15@fluxa.test','{}','authenticated','authenticated','',now()),
 ('15150000-0000-0000-0000-000000000005','bootstrap15@fluxa.test','{"full_name":"Bootstrap 15"}','authenticated','authenticated','',now()),
 ('15150000-0000-0000-0000-000000000006','pending15@fluxa.test','{}','authenticated','authenticated','',now()),
 ('15150000-0000-0000-0000-000000000007','inactive15@fluxa.test','{}','authenticated','authenticated','',now()),
 ('15150000-0000-0000-0000-000000000008','accept15@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name,created_by) VALUES
 ('25150000-0000-0000-0000-000000000001','Stage 15 A Ltda','Stage 15 A','15150000-0000-0000-0000-000000000001'),
 ('25150000-0000-0000-0000-000000000002','Stage 15 B Ltda','Stage 15 B','15150000-0000-0000-0000-000000000004');
INSERT INTO public.organization_members(id,organization_id,user_id,role,is_active) VALUES
 ('35150000-0000-0000-0000-000000000001','25150000-0000-0000-0000-000000000001','15150000-0000-0000-0000-000000000001','proprietario',true),
 ('35150000-0000-0000-0000-000000000002','25150000-0000-0000-0000-000000000001','15150000-0000-0000-0000-000000000002','administrador',true),
 ('35150000-0000-0000-0000-000000000003','25150000-0000-0000-0000-000000000001','15150000-0000-0000-0000-000000000003','operacional',true),
 ('35150000-0000-0000-0000-000000000004','25150000-0000-0000-0000-000000000002','15150000-0000-0000-0000-000000000004','proprietario',true),
 ('35150000-0000-0000-0000-000000000007','25150000-0000-0000-0000-000000000001','15150000-0000-0000-0000-000000000007','visualizador',false);
INSERT INTO public.organization_invitations(id,organization_id,email,role,status,token_hash,expires_at) VALUES
 ('45150000-0000-0000-0000-000000000001','25150000-0000-0000-0000-000000000001','accept15@fluxa.test','gestor','pending',encode(extensions.digest(repeat('p',32),'sha256'),'hex'),now()+interval '1 day'),
 ('45150000-0000-0000-0000-000000000002','25150000-0000-0000-0000-000000000001','pending15@fluxa.test','operacional','pending',encode(extensions.digest(repeat('q',32),'sha256'),'hex'),now()+interval '1 day'),
 ('45150000-0000-0000-0000-000000000003','25150000-0000-0000-0000-000000000001','accept15@fluxa.test','operacional','cancelled',encode(extensions.digest(repeat('c',32),'sha256'),'hex'),now()+interval '1 day'),
 ('45150000-0000-0000-0000-000000000004','25150000-0000-0000-0000-000000000001','expired15@fluxa.test','operacional','pending',encode(extensions.digest(repeat('e',32),'sha256'),'hex'),now()-interval '1 day'),
 ('45150000-0000-0000-0000-000000000005','25150000-0000-0000-0000-000000000001','accept15@fluxa.test','operacional','accepted',encode(extensions.digest(repeat('u',32),'sha256'),'hex'),now()+interval '1 day'),
 ('45150000-0000-0000-0000-000000000006','25150000-0000-0000-0000-000000000002','cross15@fluxa.test','operacional','pending',encode(extensions.digest(repeat('x',32),'sha256'),'hex'),now()+interval '1 day');

SET LOCAL ROLE anon;
SELECT is((SELECT organization_name FROM public.invitation_preview(repeat('p',32))), 'Stage 15 A', 'anon previews a valid token');
SELECT is((SELECT count(*) FROM public.invitation_preview('invalid')), 0::bigint, 'invalid token reveals no data');
SELECT throws_ok($$SELECT * FROM public.organization_invitations$$, '42501', 'permission denied for table organization_invitations', 'anon direct invitation SELECT is denied');
SELECT throws_ok($$SELECT * FROM public.accept_invitation(repeat('p',32))$$, '42501', 'permission denied for function accept_invitation', 'accept invitation requires authenticated role');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000001',true);
SELECT throws_ok($$UPDATE public.organization_members SET role='gestor' WHERE id='35150000-0000-0000-0000-000000000003'$$, '42501', 'permission denied for table organization_members', 'direct role change is denied');
SELECT lives_ok($$SELECT public.change_member_role('35150000-0000-0000-0000-000000000003','gestor')$$, 'role change still works through RPC');
SELECT is((SELECT role::text FROM public.organization_members WHERE id='35150000-0000-0000-0000-000000000003'), 'gestor', 'role RPC persists');
SELECT lives_ok($$SELECT public.set_member_active('35150000-0000-0000-0000-000000000003',false)$$, 'deactivation still works through RPC');
SELECT is((SELECT is_active FROM public.organization_members WHERE id='35150000-0000-0000-0000-000000000003'), false, 'active RPC persists');
SELECT lives_ok($$SELECT * FROM public.create_invitation('25150000-0000-0000-0000-000000000001','new15@fluxa.test','administrador')$$, 'owner can invite administrator');
SELECT throws_ok($$SELECT * FROM public.create_invitation('25150000-0000-0000-0000-000000000002','cross15@fluxa.test','operacional')$$, 'P0001', 'NOT_ALLOWED', 'cross-org invitation creation blocked');
SELECT throws_ok($$SELECT public.cancel_invitation('45150000-0000-0000-0000-000000000006')$$, 'P0001', 'NOT_ALLOWED', 'cross-org cancellation blocked');

SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000002',true);
SELECT lives_ok($$SELECT * FROM public.create_invitation('25150000-0000-0000-0000-000000000001','staff15@fluxa.test','operacional')$$, 'administrator can invite ordinary role');
SELECT throws_ok($$SELECT * FROM public.create_invitation('25150000-0000-0000-0000-000000000001','admin-new15@fluxa.test','administrador')$$, 'P0001', 'NOT_ALLOWED', 'administrator cannot invite administrator');

SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000008',true);
SELECT throws_ok($$SELECT public.accept_invitation(repeat('c',32))$$, 'P0001', 'INVITE_CANCELLED', 'cancelled invitation blocked');
RESET ROLE;
SELECT throws_ok($$
  SELECT public.accept_invitation(repeat('e',32))
    FROM public.organization_invitations i
   WHERE i.id='45150000-0000-0000-0000-000000000004'
     AND i.status='expired'
     AND i.expires_at<now()
     AND lower(i.email)='expired15@fluxa.test'
     AND i.token_hash=encode(extensions.digest(repeat('e',32),'sha256'),'hex')
$$, 'P0001', 'INVITE_ALREADY_USED', 'normalized expired fixture exists with expected fields and cannot be accepted');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000008',true);
SELECT throws_ok($$SELECT public.accept_invitation(repeat('u',32))$$, 'P0001', 'INVITE_ALREADY_USED', 'used invitation blocked');
SELECT lives_ok($$SELECT * FROM public.accept_invitation(repeat('p',32))$$, 'matching user accepts valid invitation');
SELECT throws_ok($$SELECT public.accept_invitation(repeat('p',32))$$, 'P0001', 'INVITE_NOT_FOUND', 'accepted token cannot be reused');

SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000004',true);
SELECT throws_ok($$SELECT public.accept_invitation(repeat('q',32))$$, 'P0001', 'INVITE_EMAIL_MISMATCH', 'invitation requires matching email');

SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT * FROM public.bootstrap_organization()$$, '28000', 'BOOTSTRAP_NO_SESSION', 'bootstrap requires a session');
SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000005',true);
SELECT lives_ok($$SELECT * FROM public.bootstrap_organization()$$, 'unlinked authenticated user bootstraps organization');
SELECT is((SELECT role::text FROM public.organization_members WHERE user_id='15150000-0000-0000-0000-000000000005'), 'proprietario', 'bootstrap creator is owner');
SELECT is((SELECT count(*) FROM public.bootstrap_organization()), 1::bigint, 'bootstrap reuses existing organization and membership');
SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000006',true);
SELECT throws_ok($$SELECT * FROM public.bootstrap_organization()$$, 'P0001', 'BOOTSTRAP_INVITATION_PENDING', 'pending invitation defers own organization creation');
SELECT is((SELECT count(*) FROM public.organization_members WHERE user_id='15150000-0000-0000-0000-000000000006'), 0::bigint, 'pending invite user gets no owner membership');
SELECT set_config('request.jwt.claim.sub','15150000-0000-0000-0000-000000000007',true);
SELECT throws_ok($$SELECT * FROM public.bootstrap_organization()$$, '28000', 'BOOTSTRAP_MEMBERSHIP_INACTIVE', 'inactive secondary membership stays inactive');
SELECT is((SELECT role::text FROM public.organization_members WHERE user_id='15150000-0000-0000-0000-000000000007'), 'visualizador', 'secondary user is not promoted');
SELECT is((SELECT is_active FROM public.organization_members WHERE user_id='15150000-0000-0000-0000-000000000007'), false, 'secondary membership is not reactivated');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
