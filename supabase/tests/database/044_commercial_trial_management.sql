BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public', 'platform_admins', 'platform administrators table exists');
SELECT has_table('public', 'organization_subscriptions', 'organization subscriptions table exists');
SELECT has_function('public', 'is_platform_admin', ARRAY[]::text[], 'platform admin check exists');
SELECT has_function('public', 'list_platform_organizations', ARRAY[]::text[], 'platform organization list exists');
SELECT has_function(
  'public', 'manage_platform_organization', ARRAY['uuid', 'text', 'integer'],
  'platform organization management exists'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.is_platform_admin()', 'EXECUTE')
  AND has_function_privilege(
    'authenticated', 'public.list_platform_organizations()', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.manage_platform_organization(uuid,text,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege('anon', 'public.is_platform_admin()', 'EXECUTE')
  AND NOT has_function_privilege(
    'anon', 'public.list_platform_organizations()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.manage_platform_organization(uuid,text,integer)',
    'EXECUTE'
  ),
  'commercial RPC grants are minimal'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.organization_subscriptions', 'SELECT')
  AND NOT has_table_privilege(
    'authenticated', 'public.organization_subscriptions', 'INSERT'
  )
  AND NOT has_table_privilege(
    'authenticated', 'public.organization_subscriptions', 'UPDATE'
  )
  AND NOT has_table_privilege(
    'authenticated', 'public.organization_subscriptions', 'DELETE'
  )
  AND NOT has_table_privilege('authenticated', 'public.platform_admins', 'SELECT'),
  'members can only read their own commercial state and cannot inspect admins'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    LEFT JOIN public.organization_subscriptions AS subscription
      ON subscription.organization_id = organization.id
    WHERE subscription.organization_id IS NULL
  ),
  'every organization that predates the migration was backfilled'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  (
    '19600000-0000-0000-0000-000000000001',
    'platform-admin@fluxa.test', '{"full_name":"Admin Plataforma"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19600000-0000-0000-0000-000000000002',
    'trial-owner@fluxa.test', '{"full_name":"Responsável Teste"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19600000-0000-0000-0000-000000000003',
    'regular-user@fluxa.test', '{"full_name":"Usuário Comum"}',
    'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name, created_by) VALUES
  (
    '29600000-0000-0000-0000-000000000001',
    'Empresa Administradora',
    '19600000-0000-0000-0000-000000000001'
  ),
  (
    '29600000-0000-0000-0000-000000000002',
    'Empresa em Teste',
    '19600000-0000-0000-0000-000000000002'
  );

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29600000-0000-0000-0000-000000000001',
    '19600000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29600000-0000-0000-0000-000000000002',
    '19600000-0000-0000-0000-000000000002', 'proprietario', true
  ),
  (
    '29600000-0000-0000-0000-000000000002',
    '19600000-0000-0000-0000-000000000003', 'visualizador', true
  );

INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19600000-0000-0000-0000-000000000001',
  '19600000-0000-0000-0000-000000000001'
);

SELECT ok(
  (
    SELECT status = 'trial'
      AND plan_code = 'trial'
      AND trial_started_at IS NOT NULL
      AND trial_ends_at BETWEEN now() + interval '13 days 23 hours'
        AND now() + interval '14 days 1 hour'
    FROM public.organization_subscriptions
    WHERE organization_id = '29600000-0000-0000-0000-000000000002'
  ),
  'a newly created organization automatically receives a 14-day trial'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19600000-0000-0000-0000-000000000001', true
);

SELECT ok(public.is_platform_admin(), 'the registered platform administrator is recognized');
SELECT is(
  (SELECT count(*) FROM public.organization_subscriptions),
  1::bigint,
  'direct subscription reads remain limited to the administrator own workspace'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.list_platform_organizations()
    WHERE organization_id IN (
      '29600000-0000-0000-0000-000000000001',
      '29600000-0000-0000-0000-000000000002'
    )
  ),
  2::bigint,
  'the protected administration RPC lists all active organizations'
);
SELECT throws_ok(
  $$SELECT public.manage_platform_organization(
    '29600000-0000-0000-0000-000000000001', 'suspend', NULL
  )$$,
  'P0001', 'CANNOT_SUSPEND_CURRENT_ADMIN_ORGANIZATION',
  'the administrator cannot suspend the workspace used to manage the platform'
);
SELECT throws_ok(
  $$SELECT public.manage_platform_organization(
    '29600000-0000-0000-0000-000000000002', 'extend_trial', 0
  )$$,
  'P0001', 'INVALID_TRIAL_EXTENSION',
  'trial extensions outside the safe range are rejected'
);
SELECT lives_ok(
  $$SELECT public.manage_platform_organization(
    '29600000-0000-0000-0000-000000000002', 'extend_trial', 7
  )$$,
  'the administrator can extend a trial'
);
SELECT lives_ok(
  $$SELECT public.manage_platform_organization(
    '29600000-0000-0000-0000-000000000002', 'activate', NULL
  )$$,
  'the administrator can activate a company'
);
SELECT lives_ok(
  $$SELECT public.manage_platform_organization(
    '29600000-0000-0000-0000-000000000002', 'suspend', NULL
  )$$,
  'the administrator can suspend another company'
);
RESET ROLE;

SELECT ok(
  (
    SELECT status = 'suspended'
      AND trial_ends_at BETWEEN now() + interval '20 days 23 hours'
        AND now() + interval '21 days 1 hour'
    FROM public.organization_subscriptions
    WHERE organization_id = '29600000-0000-0000-0000-000000000002'
  ),
  'commercial actions preserve the extended trial date and set the requested status'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE organization_id = '29600000-0000-0000-0000-000000000002'
      AND action IN (
        'platform.subscription.extend_trial',
        'platform.subscription.activate',
        'platform.subscription.suspend'
      )
  ),
  3::bigint,
  'every successful commercial action is audited'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19600000-0000-0000-0000-000000000002', true
);
SELECT ok(NOT public.is_platform_admin(), 'an organization owner is not a platform administrator');
SELECT is(
  (SELECT count(*) FROM public.organization_subscriptions),
  1::bigint,
  'an organization owner can read only their own commercial state'
);
SELECT throws_ok(
  $$SELECT count(*) FROM public.list_platform_organizations()$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'a regular organization owner cannot list other companies'
);
SELECT throws_ok(
  $$SELECT public.manage_platform_organization(
    '29600000-0000-0000-0000-000000000002', 'activate', NULL
  )$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'a regular organization owner cannot change commercial access'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
