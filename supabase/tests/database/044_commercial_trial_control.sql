BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_column('public', 'organizations', 'commercial_status', 'commercial status exists');
SELECT has_column('public', 'organizations', 'trial_started_at', 'trial start exists');
SELECT has_column('public', 'organizations', 'trial_ends_at', 'trial end exists');
SELECT has_table('public', 'platform_admins', 'platform administrators are explicit');
SELECT has_function('public', 'is_platform_admin', ARRAY[]::text[], 'platform admin check exists');
SELECT has_function('public', 'platform_organizations', ARRAY[]::text[], 'platform listing exists');
SELECT has_function(
  'public', 'update_organization_commercial_status', ARRAY['uuid', 'text', 'integer'],
  'commercial management RPC exists'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.platform_organizations()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.platform_organizations()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.platform_organizations()', 'EXECUTE'),
  'platform listing can only be invoked by authenticated sessions'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19530000-0000-0000-0000-000000000001', 'platform-admin@fluxa.test',
    '{"full_name":"Admin Plataforma"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19530000-0000-0000-0000-000000000002', 'trial-owner@fluxa.test',
    '{"full_name":"Empresa em Teste"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19530000-0000-0000-0000-000000000003', 'outsider@fluxa.test',
    '{"full_name":"Sem Administração"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(
  id, legal_name, created_by, commercial_status, trial_started_at, trial_ends_at
) VALUES
  (
    '29530000-0000-0000-0000-000000000001', 'Empresa Teste Vencido',
    '19530000-0000-0000-0000-000000000002', 'trial', now() - interval '15 days', now() - interval '1 day'
  ),
  (
    '29530000-0000-0000-0000-000000000002', 'Empresa Ativa Existente',
    '19530000-0000-0000-0000-000000000003', 'active', NULL, NULL
  );

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  (
    '29530000-0000-0000-0000-000000000001',
    '19530000-0000-0000-0000-000000000002', 'proprietario', true
  ),
  (
    '29530000-0000-0000-0000-000000000002',
    '19530000-0000-0000-0000-000000000003', 'proprietario', true
  );

INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19530000-0000-0000-0000-000000000001',
  '19530000-0000-0000-0000-000000000001'
);

INSERT INTO public.organizations(id, legal_name, created_by) VALUES (
  '29530000-0000-0000-0000-000000000003', 'Novo Cadastro Padrão',
  '19530000-0000-0000-0000-000000000003'
);

SELECT ok(
  (
    SELECT commercial_status = 'trial'
      AND trial_started_at IS NOT NULL
      AND trial_ends_at BETWEEN now() + interval '13 days 23 hours' AND now() + interval '14 days 1 minute'
      FROM public.organizations
     WHERE id = '29530000-0000-0000-0000-000000000003'
  ),
  'new organizations receive a fourteen-day trial by default'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19530000-0000-0000-0000-000000000002', true);

SELECT ok(
  public.has_org_membership('29530000-0000-0000-0000-000000000001'),
  'expired owner keeps the membership needed to explain the block'
);
SELECT ok(
  NOT public.is_org_member('29530000-0000-0000-0000-000000000001'),
  'expired trial loses operational membership access'
);
SELECT throws_ok(
  $$SELECT * FROM public.platform_organizations()$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary organization owner cannot list other companies'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19530000-0000-0000-0000-000000000001', true);

SELECT ok(public.is_platform_admin(), 'registered administrator is recognized');
SELECT is(
  (
    SELECT effective_status
      FROM public.platform_organizations()
     WHERE organization_id = '29530000-0000-0000-0000-000000000001'
  ),
  'expired',
  'expired trial is derived in the platform listing'
);
SELECT lives_ok(
  $$SELECT public.update_organization_commercial_status(
    '29530000-0000-0000-0000-000000000001', 'extend_trial', 14
  )$$,
  'platform administrator can extend a trial'
);
SELECT is(
  (
    SELECT effective_status
      FROM public.platform_organizations()
     WHERE organization_id = '29530000-0000-0000-0000-000000000001'
  ),
  'trial',
  'extended trial becomes accessible again'
);
SELECT lives_ok(
  $$SELECT public.update_organization_commercial_status(
    '29530000-0000-0000-0000-000000000001', 'activate', NULL
  )$$,
  'platform administrator can activate a company'
);
SELECT lives_ok(
  $$SELECT public.update_organization_commercial_status(
    '29530000-0000-0000-0000-000000000001', 'suspend', NULL
  )$$,
  'platform administrator can suspend a company'
);
SELECT throws_ok(
  $$SELECT public.update_organization_commercial_status(
    '29530000-0000-0000-0000-000000000001', 'extend_trial', 0
  )$$,
  '22023', 'INVALID_TRIAL_EXTENSION',
  'invalid extensions are rejected'
);
RESET ROLE;

SELECT is(
  (
    SELECT commercial_status
      FROM public.organizations
     WHERE id = '29530000-0000-0000-0000-000000000001'
  ),
  'suspended',
  'last administrative action is persisted'
);
SELECT is(
  (
    SELECT count(*)
      FROM public.audit_logs
     WHERE organization_id = '29530000-0000-0000-0000-000000000001'
       AND action = 'platform.organization.commercial_status_changed'
  ),
  3::bigint,
  'every successful commercial action is audited'
);

SELECT * FROM finish();
ROLLBACK;
