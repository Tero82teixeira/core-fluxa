BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public', 'client_portal_communication_ratings', 'portal rating table exists');
SELECT has_table('public', 'client_portal_callback_requests', 'portal callback table exists');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.client_portal_communication_ratings', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_callback_requests', 'SELECT'),
  'portal experience tables are exposed only through guarded RPCs'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.submit_client_portal_communication_rating(uuid,smallint,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.create_client_portal_callback_request(uuid,uuid,timestamp with time zone,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.prepare_communication_push(uuid,uuid)', 'EXECUTE'),
  'browser RPCs require authentication and push dispatch remains service-only'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
 ('19900000-0000-0000-0000-000000000001','experience-owner@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19900000-0000-0000-0000-000000000002','experience-client@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19900000-0000-0000-0000-000000000003','experience-outsider@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,created_by)
VALUES ('29900000-0000-0000-0000-000000000001','Portal Experience Tenant','19900000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES ('29900000-0000-0000-0000-000000000001','19900000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.clients(id,organization_id,name,email,owner_id,created_by)
VALUES ('39900000-0000-0000-0000-000000000001','29900000-0000-0000-0000-000000000001','Cliente Experiência','experience-client@fluxa.test','19900000-0000-0000-0000-000000000001','19900000-0000-0000-0000-000000000001');
INSERT INTO public.client_portal_access(id,organization_id,client_id,user_id,email,is_active,invited_by)
VALUES ('69900000-0000-0000-0000-000000000001','29900000-0000-0000-0000-000000000001','39900000-0000-0000-0000-000000000001','19900000-0000-0000-0000-000000000002','experience-client@fluxa.test',true,'19900000-0000-0000-0000-000000000001');
INSERT INTO public.communication_threads(id,organization_id,client_id,subject,channel,status,priority,assigned_to,created_by)
VALUES ('49900000-0000-0000-0000-000000000001','29900000-0000-0000-0000-000000000001','39900000-0000-0000-0000-000000000001','Atendimento concluído','interno','resolvida','normal','19900000-0000-0000-0000-000000000001','19900000-0000-0000-0000-000000000001');
INSERT INTO public.client_portal_communication_shares(organization_id,client_id,thread_id,is_shared,opened_by_client,shared_at)
VALUES ('29900000-0000-0000-0000-000000000001','39900000-0000-0000-0000-000000000001','49900000-0000-0000-0000-000000000001',true,true,now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19900000-0000-0000-0000-000000000002',true);
SELECT lives_ok(
 $$SELECT public.submit_client_portal_communication_rating('49900000-0000-0000-0000-000000000001',5,'Ótimo atendimento')$$,
 'linked portal client can rate a resolved shared conversation'
);
SELECT lives_ok(
 $$SELECT public.create_client_portal_callback_request('69900000-0000-0000-0000-000000000001','49900000-0000-0000-0000-000000000001',now()+interval '1 day','Quero revisar os próximos passos')$$,
 'linked portal client can request a scheduled callback'
);
SELECT is(
 (SELECT count(*) FROM public.tasks WHERE organization_id='29900000-0000-0000-0000-000000000001' AND client_id='39900000-0000-0000-0000-000000000001'),
 1::bigint,
 'callback request creates one linked task for the company'
);
SELECT lives_ok(
 $$SELECT public.register_client_portal_push_subscription('https://push.example.test/subscription-199','12345678901234567890','12345678','pgtap')$$,
 'portal client can register this device for reply alerts'
);
SELECT is(
 (SELECT count(*) FROM public.push_subscriptions WHERE user_id='19900000-0000-0000-0000-000000000002' AND is_active),
 1::bigint,
 'push subscription is scoped to the portal identity'
);

SELECT set_config('request.jwt.claim.sub','19900000-0000-0000-0000-000000000003',true);
SELECT throws_ok(
 $$SELECT public.submit_client_portal_communication_rating('49900000-0000-0000-0000-000000000001',1,NULL)$$,
 '42501','RATING_NOT_ALLOWED','an unrelated identity cannot rate the conversation'
);

SELECT set_config('request.jwt.claim.sub','19900000-0000-0000-0000-000000000001',true);
SELECT is(
 (SELECT count(*) FROM public.list_staff_client_portal_callback_requests('29900000-0000-0000-0000-000000000001')),
 1::bigint,
 'company owner sees the callback request'
);
SELECT lives_ok(
 format($$SELECT public.update_staff_client_portal_callback_request('29900000-0000-0000-0000-000000000001','%s','completed','Retorno realizado')$$,
   (SELECT id FROM public.client_portal_callback_requests LIMIT 1)),
 'company owner can complete the callback request'
);
SELECT is(
 (public.communication_experience_metrics('29900000-0000-0000-0000-000000000001',now()-interval '1 day',now())->>'rating_count')::integer,
 1,
 'management report counts client ratings'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
