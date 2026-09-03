BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_function_privilege('authenticated', 'public.resolve_authenticated_home()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.resolve_authenticated_home()', 'EXECUTE'),
  'only authenticated identities can resolve their destination'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.client_portal_session()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.client_portal_session()', 'EXECUTE'),
  'only authenticated identities can load the portal session'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19700000-0000-0000-0000-000000000001', 'portal-shell@fluxa.test',
    '{"full_name":"Portal Shell"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19700000-0000-0000-0000-000000000002', 'portal-other-shell@fluxa.test',
    '{"full_name":"Other Portal Shell"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19700000-0000-0000-0000-000000000003', 'workspace-shell@fluxa.test',
    '{"full_name":"Workspace Shell"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19700000-0000-0000-0000-000000000004', 'pending-shell@fluxa.test',
    '{"full_name":"Pending Shell"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name, created_by) VALUES
  (
    '29700000-0000-0000-0000-000000000001', 'Portal Shell Company',
    '19700000-0000-0000-0000-000000000003'
  ),
  (
    '29700000-0000-0000-0000-000000000002', 'Other Shell Company',
    '19700000-0000-0000-0000-000000000003'
  );

INSERT INTO public.clients(id, organization_id, name, email) VALUES
  (
    '39700000-0000-0000-0000-000000000001',
    '29700000-0000-0000-0000-000000000001',
    'Portal Shell Client', 'portal-shell@fluxa.test'
  ),
  (
    '39700000-0000-0000-0000-000000000002',
    '29700000-0000-0000-0000-000000000002',
    'Other Shell Client', 'portal-other-shell@fluxa.test'
  );

INSERT INTO public.client_portal_access(
  id, organization_id, client_id, user_id, email, is_active, invited_by
) VALUES
  (
    '49700000-0000-0000-0000-000000000001',
    '29700000-0000-0000-0000-000000000001',
    '39700000-0000-0000-0000-000000000001',
    '19700000-0000-0000-0000-000000000001',
    'portal-shell@fluxa.test', true,
    '19700000-0000-0000-0000-000000000003'
  ),
  (
    '49700000-0000-0000-0000-000000000002',
    '29700000-0000-0000-0000-000000000002',
    '39700000-0000-0000-0000-000000000002',
    '19700000-0000-0000-0000-000000000002',
    'portal-other-shell@fluxa.test', false,
    '19700000-0000-0000-0000-000000000003'
  ),
  (
    '49700000-0000-0000-0000-000000000003',
    '29700000-0000-0000-0000-000000000002',
    '39700000-0000-0000-0000-000000000002',
    '19700000-0000-0000-0000-000000000003',
    'workspace-shell@fluxa.test', true,
    '19700000-0000-0000-0000-000000000003'
  );

INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES (
  '29700000-0000-0000-0000-000000000001',
  '19700000-0000-0000-0000-000000000003',
  'proprietario', true
);

INSERT INTO public.client_portal_invitations(
  organization_id, client_id, email, token_hash, status, invited_by, expires_at
) VALUES (
  '29700000-0000-0000-0000-000000000001',
  '39700000-0000-0000-0000-000000000001',
  'pending-shell@fluxa.test', repeat('a', 64), 'pending',
  '19700000-0000-0000-0000-000000000003', now() + interval '1 day'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19700000-0000-0000-0000-000000000001","email":"portal-shell@fluxa.test","role":"authenticated"}',
  true
);
SELECT is(
  public.resolve_authenticated_home(), 'client_portal',
  'a portal-only identity is directed to Meu Portal'
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_session()), 1,
  'the portal session contains only the caller access'
);
SELECT is(
  (
    SELECT organization_name || ':' || client_name || ':' || is_active::text
      FROM public.client_portal_session()
  ),
  'Portal Shell Company:Portal Shell Client:true',
  'the session exposes only minimal linked identity data'
);
SELECT is(
  (SELECT count(*)::integer FROM public.clients), 0,
  'the shell does not grant direct client table access'
);
SELECT is(
  (SELECT count(*)::integer FROM public.processes), 0,
  'the shell does not grant direct process table access'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19700000-0000-0000-0000-000000000002","email":"portal-other-shell@fluxa.test","role":"authenticated"}',
  true
);
SELECT is(
  public.resolve_authenticated_home(), 'client_portal',
  'an identity with disabled access still reaches the portal status screen'
);
SELECT is(
  (SELECT is_active FROM public.client_portal_session()), false,
  'disabled access is represented without exposing operational data'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19700000-0000-0000-0000-000000000003","email":"workspace-shell@fluxa.test","role":"authenticated"}',
  true
);
SELECT is(
  public.resolve_authenticated_home(), 'workspace',
  'an internal membership remains the primary destination'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19700000-0000-0000-0000-000000000004","email":"pending-shell@fluxa.test","role":"authenticated"}',
  true
);
SELECT is(
  public.resolve_authenticated_home(), 'client_portal',
  'a pending portal invitation avoids accidental workspace bootstrap'
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_session()), 0,
  'a pending invitation is not presented as accepted access'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
