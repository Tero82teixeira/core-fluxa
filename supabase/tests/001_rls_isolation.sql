BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.clients'::regclass), 'clients has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.tasks'::regclass), 'tasks has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.audit_logs'::regclass), 'audit_logs has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.organization_members'::regclass), 'organization_members has RLS enabled');

INSERT INTO auth.users (id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('11000000-0000-0000-0000-000000000001','active@fluxa.test','{}','authenticated','authenticated','',now()),
 ('11000000-0000-0000-0000-000000000002','inactive@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations (id,legal_name) VALUES
 ('21000000-0000-0000-0000-000000000001','RLS Organization A'),
 ('21000000-0000-0000-0000-000000000002','RLS Organization B');
INSERT INTO public.organization_members (organization_id,user_id,role,is_active) VALUES
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','operacional',true),
 ('21000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','administrador',false);
INSERT INTO public.clients (id,organization_id,name) VALUES
 ('31000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Client A'),
 ('31000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','Client B');
INSERT INTO public.tasks (id,organization_id,title,status) VALUES
 ('41000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','Task A','pendente'),
 ('41000000-0000-0000-0000-000000000002','21000000-0000-0000-0000-000000000002','Task B','pendente');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
SELECT is((SELECT count(*) FROM public.clients),1::bigint,'member sees only clients from its organization');
SELECT is((SELECT count(*) FROM public.clients WHERE organization_id='21000000-0000-0000-0000-000000000002'),0::bigint,'cross-organization client read is blocked');
SELECT is((SELECT count(*) FROM public.tasks),1::bigint,'member sees only tasks from its organization');
SELECT is((SELECT count(*) FROM public.tasks WHERE organization_id='21000000-0000-0000-0000-000000000002'),0::bigint,'cross-organization task read is blocked');
SELECT ok(public.is_org_member('21000000-0000-0000-0000-000000000001'),'active member is recognized');
SELECT ok(NOT public.is_org_member('21000000-0000-0000-0000-000000000002'),'member is rejected outside its organization');
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT ok(NOT public.is_org_member('21000000-0000-0000-0000-000000000001'),'inactive member is blocked');
SELECT is((SELECT count(*) FROM public.clients),0::bigint,'inactive member cannot read organization clients');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT ok(NOT has_table_privilege('anon','public.clients','SELECT'),'anon cannot read clients');
SELECT ok(NOT has_table_privilege('anon','public.tasks','SELECT'),'anon cannot read tasks');
SELECT ok(NOT public.is_org_member('21000000-0000-0000-0000-000000000001'),'anon is not an organization member');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
