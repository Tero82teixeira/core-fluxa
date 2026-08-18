BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('16000000-0000-0000-0000-000000000001','audit-member@fluxa.test','{"full_name":"JWT Forgery"}','authenticated','authenticated','',now()),
 ('16000000-0000-0000-0000-000000000002','audit-outsider@fluxa.test','{"full_name":"Outsider"}','authenticated','authenticated','',now());
UPDATE public.profiles SET full_name='Trusted Profile Name' WHERE id='16000000-0000-0000-0000-000000000001';
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('26000000-0000-0000-0000-000000000001','Audit A Ltda','Audit A'),
 ('26000000-0000-0000-0000-000000000002','Audit B Ltda','Audit B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('26000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','operacional',true),
 ('26000000-0000-0000-0000-000000000002','16000000-0000-0000-0000-000000000002','operacional',true);
INSERT INTO public.audit_logs(organization_id,actor_id,action,entity)
VALUES ('26000000-0000-0000-0000-000000000002','16000000-0000-0000-0000-000000000002','seed','test');

SELECT ok(NOT has_table_privilege('authenticated','public.audit_logs','INSERT'),'authenticated has no direct INSERT');
SELECT ok(NOT has_table_privilege('anon','public.audit_logs','INSERT'),'anon has no INSERT');
SELECT ok(NOT has_table_privilege('anon','public.audit_logs','UPDATE'),'anon has no UPDATE');
SELECT ok(NOT has_table_privilege('anon','public.audit_logs','DELETE'),'anon has no DELETE');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','16000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($$SELECT public.record_audit_event('26000000-0000-0000-0000-000000000001','test.created','test',NULL,'{"safe":true}')$$,'active member records an event');
SELECT is((SELECT actor_id FROM public.audit_logs WHERE action='test.created'),'16000000-0000-0000-0000-000000000001'::uuid,'actor_id equals auth.uid()');
SELECT is((SELECT actor_name FROM public.audit_logs WHERE action='test.created'),'Trusted Profile Name','actor_name comes from profiles');
SELECT throws_ok($$SELECT public.record_audit_event('26000000-0000-0000-0000-000000000002','forged','test')$$,'42501','AUDIT_ORGANIZATION_ACCESS_DENIED','cannot record in another organization');
SELECT throws_ok($$UPDATE public.audit_logs SET action='tampered' WHERE action='test.created'$$,'42501',NULL,'direct UPDATE is rejected');
SELECT throws_ok($$DELETE FROM public.audit_logs WHERE action='test.created'$$,'42501',NULL,'direct DELETE is rejected');
SELECT is((SELECT count(*) FROM public.audit_logs),1::bigint,'SELECT only exposes own organization');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT throws_ok($$SELECT public.record_audit_event('26000000-0000-0000-0000-000000000001','anonymous','test')$$,'42501','AUDIT_AUTHENTICATION_REQUIRED','RPC rejects unauthenticated calls');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
