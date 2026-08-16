BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(10);

SELECT has_function(
  'public',
  'bootstrap_organization',
  ARRAY[]::name[],
  'bootstrap_organization exists'
);
SELECT has_function(
  'public',
  'is_org_member',
  ARRAY['uuid']::name[],
  'is_org_member(uuid) exists'
);
SELECT has_function(
  'public',
  'has_org_role',
  ARRAY['uuid', 'app_role[]']::name[],
  'has_org_role(uuid, app_role[]) exists'
);
SELECT is(
  (
    SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'pending_invitation_diagnostics'
  ),
  0::bigint,
  'legacy pending invitation diagnostics RPC is absent from the public schema'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.bootstrap_organization()', 'EXECUTE'),
  'authenticated can execute bootstrap_organization'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.bootstrap_organization()', 'EXECUTE'),
  'anon cannot execute bootstrap_organization'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.is_org_member(uuid)', 'EXECUTE'),
  'authenticated can execute is_org_member'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.is_org_member(uuid)', 'EXECUTE'),
  'anon cannot execute is_org_member'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.has_org_role(uuid, public.app_role[])', 'EXECUTE'),
  'authenticated can execute has_org_role'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.has_org_role(uuid, public.app_role[])', 'EXECUTE'),
  'anon cannot execute has_org_role'
);

SELECT * FROM finish();
ROLLBACK;
