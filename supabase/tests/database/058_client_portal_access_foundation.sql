BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_client_portal_invitation(uuid,uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.create_client_portal_invitation(uuid,uuid,text)',
    'EXECUTE'
  ),
  'only authenticated internal managers can request a portal invitation'
);
SELECT ok(
  has_function_privilege(
    'anon', 'public.client_portal_invitation_preview(text)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated', 'public.accept_client_portal_invitation(text)', 'EXECUTE'
  ),
  'a token can be previewed publicly but only an authenticated user can accept it'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.client_portal_access', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_access', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_access', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_invitations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_invitations', 'UPDATE'),
  'authenticated clients cannot grant or mutate portal access directly'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19690000-0000-0000-0000-000000000001', 'portal-owner@fluxa.test',
    '{"full_name":"Portal Owner"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19690000-0000-0000-0000-000000000002', 'portal-user@fluxa.test',
    '{"full_name":"Portal User"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19690000-0000-0000-0000-000000000003', 'portal-other@fluxa.test',
    '{"full_name":"Other User"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19690000-0000-0000-0000-000000000004', 'portal-pending@fluxa.test',
    '{"full_name":"Pending Portal User"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name, created_by) VALUES
  (
    '29690000-0000-0000-0000-000000000001', 'Portal Company',
    '19690000-0000-0000-0000-000000000001'
  ),
  (
    '29690000-0000-0000-0000-000000000002', 'Other Portal Company',
    '19690000-0000-0000-0000-000000000003'
  );
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  (
    '29690000-0000-0000-0000-000000000001',
    '19690000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29690000-0000-0000-0000-000000000002',
    '19690000-0000-0000-0000-000000000003', 'proprietario', true
  );
INSERT INTO public.clients(id, organization_id, name, email) VALUES
  (
    '39690000-0000-0000-0000-000000000001',
    '29690000-0000-0000-0000-000000000001',
    'Portal Client', 'portal-user@fluxa.test'
  ),
  (
    '39690000-0000-0000-0000-000000000002',
    '29690000-0000-0000-0000-000000000001',
    'Private Client', 'private-client@fluxa.test'
  ),
  (
    '39690000-0000-0000-0000-000000000003',
    '29690000-0000-0000-0000-000000000002',
    'Other Organization Client', 'portal-other@fluxa.test'
  );

CREATE TEMP TABLE portal_invite_result(
  invitation_id uuid,
  token text,
  expires_at timestamptz
);
GRANT SELECT, INSERT ON portal_invite_result TO authenticated, anon;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19690000-0000-0000-0000-000000000001","email":"portal-owner@fluxa.test","role":"authenticated"}',
  true
);
INSERT INTO portal_invite_result
SELECT * FROM public.create_client_portal_invitation(
  '29690000-0000-0000-0000-000000000001',
  '39690000-0000-0000-0000-000000000001',
  'portal-user@fluxa.test'
);
SELECT is(
  (SELECT count(*)::integer FROM public.organization_members
    WHERE organization_id = '29690000-0000-0000-0000-000000000001'),
  1,
  'a pending portal invitation does not reserve one of the five team seats'
);
SELECT throws_ok(
  $$SELECT public.create_client_portal_invitation(
    '29690000-0000-0000-0000-000000000002',
    '39690000-0000-0000-0000-000000000003',
    'portal-other@fluxa.test'
  )$$,
  '42501', 'NOT_ALLOWED',
  'an owner cannot invite a client belonging to another organization'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is(
  (
    SELECT organization_name || ':' || client_name || ':' || status
      FROM public.client_portal_invitation_preview(
        (SELECT token FROM portal_invite_result)
      )
  ),
  'Portal Company:Portal Client:pending',
  'the opaque token previews only its organization, client and invitation state'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19690000-0000-0000-0000-000000000002","email":"portal-user@fluxa.test","role":"authenticated"}',
  true
);
SELECT lives_ok(
  format(
    'SELECT public.accept_client_portal_invitation(%L)',
    (SELECT token FROM portal_invite_result)
  ),
  'the invited authenticated email accepts its client-scoped access'
);
SELECT ok(
  public.has_client_portal_access(
    '29690000-0000-0000-0000-000000000001',
    '39690000-0000-0000-0000-000000000001'
  ),
  'the accepted user has access to exactly the linked client'
);
SELECT ok(
  NOT public.has_client_portal_access(
    '29690000-0000-0000-0000-000000000001',
    '39690000-0000-0000-0000-000000000002'
  ),
  'the accepted user has no access to another client in the same organization'
);
SELECT is(
  (SELECT count(id)::integer FROM public.client_portal_access),
  1,
  'RLS lets the portal user see only their own access row'
);
SELECT is(
  (SELECT count(*)::integer FROM public.clients),
  0,
  'the access foundation does not expose internal client rows'
);
SELECT is(
  (SELECT count(*)::integer FROM public.organization_members
    WHERE organization_id = '29690000-0000-0000-0000-000000000001'),
  0,
  'the portal user is not an internal organization member under RLS'
);
SELECT throws_ok(
  $$SELECT public.bootstrap_organization()$$,
  'P0001', 'BOOTSTRAP_CLIENT_PORTAL_ACCOUNT',
  'a portal-only identity cannot silently create an internal workspace'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19690000-0000-0000-0000-000000000001","email":"portal-owner@fluxa.test","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$SELECT public.create_invitation(
    '29690000-0000-0000-0000-000000000001',
    'portal-user@fluxa.test',
    'visualizador'
  )$$,
  '23514', 'PORTAL_IDENTITY_CONFLICT',
  'an active portal identity cannot become an internal team identity in the same organization'
);
INSERT INTO portal_invite_result
SELECT * FROM public.create_client_portal_invitation(
  '29690000-0000-0000-0000-000000000001',
  '39690000-0000-0000-0000-000000000002',
  'portal-pending@fluxa.test'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19690000-0000-0000-0000-000000000004","email":"portal-pending@fluxa.test","role":"authenticated"}',
  true
);
SELECT throws_ok(
  $$SELECT public.bootstrap_organization()$$,
  'P0001', 'BOOTSTRAP_CLIENT_PORTAL_INVITATION_PENDING',
  'a pending portal invite prevents accidental SaaS workspace creation'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19690000-0000-0000-0000-000000000001","email":"portal-owner@fluxa.test","role":"authenticated"}',
  true
);
SELECT lives_ok(
  format(
    'SELECT public.set_client_portal_access_active(%L, false)',
    (
      SELECT id FROM public.client_portal_access
       WHERE client_id = '39690000-0000-0000-0000-000000000001'
    )
  ),
  'the organization owner can deactivate portal access'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"19690000-0000-0000-0000-000000000002","email":"portal-user@fluxa.test","role":"authenticated"}',
  true
);
SELECT ok(
  NOT public.has_client_portal_access(
    '29690000-0000-0000-0000-000000000001',
    '39690000-0000-0000-0000-000000000001'
  ),
  'deactivation immediately removes client-scoped access'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
