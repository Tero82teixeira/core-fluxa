BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(19);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.support_request_events'::regclass),'events has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.support_request_comments'::regclass),'comments has RLS');
SELECT ok(NOT has_table_privilege('authenticated','public.support_request_events','INSERT') AND NOT has_table_privilege('authenticated','public.support_request_comments','INSERT') AND NOT has_table_privilege('authenticated','public.support_request_comments','UPDATE') AND NOT has_table_privilege('authenticated','public.support_request_comments','DELETE'),'frontend has no direct critical writes');
SELECT ok(NOT has_function_privilege('anon','public.add_support_request_comment(uuid,text)','EXECUTE'),'anon cannot add comments');
SELECT ok(has_function_privilege('authenticated','public.add_support_request_comment(uuid,text)','EXECUTE'),'authenticated can execute comment RPC');

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('11000000-0000-0000-0000-000000000001','support-admin@test.local','{}','authenticated','authenticated','',now()),
 ('11000000-0000-0000-0000-000000000002','support-user@test.local','{}','authenticated','authenticated','',now()),
 ('11000000-0000-0000-0000-000000000003','support-other@test.local','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name) VALUES
 ('22000000-0000-0000-0000-000000000001','Support org'),('22000000-0000-0000-0000-000000000002','Other support org');
INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
 ('22000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','administrador'),
 ('22000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','operacional'),
 ('22000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000003','administrador');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT lives_ok($$SELECT public.create_support_request('22000000-0000-0000-0000-000000000001','Falha detalhada','Sistema','Descrição suficientemente detalhada','normal',NULL,NULL)$$,'member creates request');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.support_request_events WHERE event_type='created'),1::bigint,'creation records timeline event');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT lives_ok(format('SELECT public.add_support_request_comment(%L,%L)',(SELECT id FROM public.support_requests LIMIT 1),'Comentário persistente'),'visible member comments');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.support_request_comments WHERE body='Comentário persistente'),1::bigint,'comment is persisted correctly');
SELECT is((SELECT count(*) FROM public.support_request_events WHERE event_type='comment_added'),1::bigint,'comment records timeline event');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000003',true);
SELECT throws_ok(format('SELECT public.add_support_request_comment(%L,%L)',(SELECT id FROM public.support_requests LIMIT 1),'Invasão'),'SUPPORT_REQUEST_ACCESS_DENIED','other organization comment is blocked');
SELECT is((SELECT count(*) FROM public.support_request_comments),0::bigint,'RLS hides another organization comments');
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
SELECT throws_ok(format('SELECT public.update_support_request_status(%L,%L)',(SELECT id FROM public.support_requests LIMIT 1),'resolvido'),'SUPPORT_ADMIN_PERMISSION_DENIED','operational role cannot change status');
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
SELECT lives_ok(format('SELECT public.update_support_request_status(%L,%L)',(SELECT id FROM public.support_requests LIMIT 1),'resolvido'),'admin can resolve');
RESET ROLE;
SELECT ok((SELECT resolved_at IS NOT NULL FROM public.support_requests LIMIT 1) AND EXISTS(SELECT 1 FROM public.support_request_events WHERE event_type='resolved'),'resolution sets date and event');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
SELECT lives_ok(format('SELECT public.update_support_request_status(%L,%L)',(SELECT id FROM public.support_requests LIMIT 1),'aberto'),'admin can reopen');
RESET ROLE;
SELECT ok((SELECT resolved_at IS NULL FROM public.support_requests LIMIT 1) AND EXISTS(SELECT 1 FROM public.support_request_events WHERE event_type='reopened'),'reopening clears resolution date and records event');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
SELECT throws_ok(format('SELECT public.assign_support_request(%L,%L)',(SELECT id FROM public.support_requests LIMIT 1),'11000000-0000-0000-0000-000000000003'),'SUPPORT_ASSIGNEE_ORG_MISMATCH','assignment respects organization');
SELECT lives_ok(format('SELECT public.archive_support_request(%L)',(SELECT id FROM public.support_requests LIMIT 1)),'archiving continues to work');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
