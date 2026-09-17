BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public','organization_access_sessions','access sessions table exists');
SELECT has_function(
  'public','record_organization_access',ARRAY['uuid']::text[],
  'access recorder RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated','public.record_organization_access(uuid)','EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon','public.record_organization_access(uuid)','EXECUTE'
  ),
  'only authenticated sessions can call the access recorder'
);
SELECT ok(
  NOT has_table_privilege('authenticated','public.organization_access_sessions','SELECT')
  AND NOT has_table_privilege('authenticated','public.organization_access_sessions','INSERT')
  AND NOT has_table_privilege('service_role','public.organization_access_sessions','SELECT'),
  'raw access sessions are not exposed through the API'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
('1e930000-0000-0000-0000-000000000001','access-owner@fluxa.test','{}','authenticated','authenticated','',now()),
('1e930000-0000-0000-0000-000000000002','access-admin@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.profiles(id,full_name,email) VALUES
('1e930000-0000-0000-0000-000000000001','Advogado Testador','access-owner@fluxa.test'),
('1e930000-0000-0000-0000-000000000002','Admin FLUXA','access-admin@fluxa.test');
INSERT INTO public.organizations(
  id,legal_name,created_by,commercial_status,trial_started_at,trial_ends_at
) VALUES
('2e930000-0000-0000-0000-000000000001','Escritório Testador',
 '1e930000-0000-0000-0000-000000000001','trial',now(),now()+interval '14 days'),
('2e930000-0000-0000-0000-000000000002','Outra Empresa',
 '1e930000-0000-0000-0000-000000000002','trial',now(),now()+interval '14 days');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2e930000-0000-0000-0000-000000000001','1e930000-0000-0000-0000-000000000001','proprietario',true),
('2e930000-0000-0000-0000-000000000002','1e930000-0000-0000-0000-000000000002','proprietario',true);
INSERT INTO public.platform_admins(user_id,created_by) VALUES
('1e930000-0000-0000-0000-000000000002','1e930000-0000-0000-0000-000000000002');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1e930000-0000-0000-0000-000000000001',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e930000-0000-0000-0000-000000000001","session_id":"session-a"}',
  true
);
SELECT lives_ok(
  $$SELECT public.record_organization_access(
    '2e930000-0000-0000-0000-000000000001'
  )$$,
  'organization owner records an authenticated access'
);
SELECT lives_ok(
  $$SELECT public.record_organization_access(
    '2e930000-0000-0000-0000-000000000001'
  )$$,
  'same auth session can safely be recorded again'
);
SELECT throws_ok(
  $$SELECT public.record_organization_access(
    '2e930000-0000-0000-0000-000000000002'
  )$$,
  '42501','NOT_ALLOWED','member cannot record access for another organization'
);

RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.organization_access_sessions
   WHERE organization_id='2e930000-0000-0000-0000-000000000001'),
  1::bigint,'reloading in the same session does not inflate the counter'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1e930000-0000-0000-0000-000000000001',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e930000-0000-0000-0000-000000000001","session_id":"session-b"}',
  true
);
SELECT public.record_organization_access('2e930000-0000-0000-0000-000000000001');

SELECT set_config('request.jwt.claim.sub','1e930000-0000-0000-0000-000000000002',true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"1e930000-0000-0000-0000-000000000002","session_id":"admin-session"}',
  true
);
SELECT is(
  (SELECT access_count FROM public.platform_organizations()
   WHERE organization_id='2e930000-0000-0000-0000-000000000001'),
  2,'platform panel counts distinct authenticated sessions'
);
SELECT is(
  (SELECT last_access_user_name FROM public.platform_organizations()
   WHERE organization_id='2e930000-0000-0000-0000-000000000001'),
  'Advogado Testador','platform panel identifies the last user'
);
SELECT ok(
  (SELECT first_access_at IS NOT NULL AND last_access_at IS NOT NULL
   FROM public.platform_organizations()
   WHERE organization_id='2e930000-0000-0000-0000-000000000001'),
  'platform panel exposes first and last access timestamps'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
