BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('15330000-0000-0000-0000-000000000001','archived33@fluxa.test','{"full_name":"Archived 33"}','authenticated','authenticated','',now()),
 ('15330000-0000-0000-0000-000000000002','dual33@fluxa.test','{"full_name":"Dual 33"}','authenticated','authenticated','',now()),
 ('15330000-0000-0000-0000-000000000003','new33@fluxa.test','{"full_name":"New 33"}','authenticated','authenticated','',now());

INSERT INTO public.organizations(id,legal_name,created_by,archived_at) VALUES
 ('25330000-0000-0000-0000-000000000001','Archived 33 Ltda','15330000-0000-0000-0000-000000000001',now()),
 ('25330000-0000-0000-0000-000000000002','Dual Archived 33 Ltda','15330000-0000-0000-0000-000000000002',now()),
 ('25330000-0000-0000-0000-000000000003','Dual Active 33 Ltda','15330000-0000-0000-0000-000000000002',NULL);

INSERT INTO public.organization_members(id,organization_id,user_id,role,is_active,created_at) VALUES
 ('35330000-0000-0000-0000-000000000001','25330000-0000-0000-0000-000000000001','15330000-0000-0000-0000-000000000001','proprietario',false,now()-interval '3 days'),
 ('35330000-0000-0000-0000-000000000002','25330000-0000-0000-0000-000000000002','15330000-0000-0000-0000-000000000002','proprietario',true,now()-interval '2 days'),
 ('35330000-0000-0000-0000-000000000003','25330000-0000-0000-0000-000000000003','15330000-0000-0000-0000-000000000002','proprietario',true,now()-interval '1 day');

SELECT ok(
  has_function_privilege('authenticated','public.bootstrap_organization()','EXECUTE'),
  'authenticated keeps bootstrap EXECUTE'
);
SELECT ok(
  NOT has_function_privilege('anon','public.bootstrap_organization()','EXECUTE'),
  'anon remains blocked from bootstrap'
);

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub','15330000-0000-0000-0000-000000000001',true);
SELECT throws_ok(
  $$SELECT * FROM public.bootstrap_organization()$$,
  '28000',
  'BOOTSTRAP_ORGANIZATION_ARCHIVED',
  'archived organization cannot be reactivated by bootstrap'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.organizations WHERE created_by='15330000-0000-0000-0000-000000000001'),
  1::bigint,
  'archived owner receives no duplicate organization'
);
SELECT is(
  (SELECT is_active FROM public.organization_members WHERE id='35330000-0000-0000-0000-000000000001'),
  false,
  'archived membership remains inactive'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15330000-0000-0000-0000-000000000002',true);
SELECT is(
  (SELECT organization_id::text FROM public.bootstrap_organization()),
  '25330000-0000-0000-0000-000000000003',
  'active organization wins over an older archived organization'
);

SELECT set_config('request.jwt.claim.sub','15330000-0000-0000-0000-000000000003',true);
SELECT lives_ok(
  $$SELECT * FROM public.bootstrap_organization()$$,
  'unlinked user still creates a normal organization'
);
SELECT is(
  (SELECT count(*) FROM public.organizations WHERE created_by='15330000-0000-0000-0000-000000000003' AND archived_at IS NULL),
  1::bigint,
  'new user receives exactly one active organization'
);
SELECT is(
  (SELECT count(*) FROM public.bootstrap_organization()),
  1::bigint,
  'normal bootstrap remains idempotent'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
