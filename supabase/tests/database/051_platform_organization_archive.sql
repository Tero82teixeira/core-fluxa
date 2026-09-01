BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'set_platform_organization_archived', ARRAY['uuid', 'boolean'],
  'reversible platform archive RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.set_platform_organization_archived(uuid, boolean)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.set_platform_organization_archived(uuid, boolean)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.set_platform_organization_archived(uuid, boolean)', 'EXECUTE'
  ),
  'only authenticated sessions can invoke the archive RPC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19630000-0000-0000-0000-000000000001', 'archive-admin@fluxa.test',
    '{"full_name":"Archive Admin"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19630000-0000-0000-0000-000000000002', 'archive-owner@fluxa.test',
    '{"full_name":"Archive Owner"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(
  id, legal_name, created_by, commercial_status, trial_started_at, trial_ends_at
) VALUES
  (
    '29630000-0000-0000-0000-000000000001', 'Archive Trial Company',
    '19630000-0000-0000-0000-000000000002', 'trial', now(), now() + interval '14 days'
  ),
  (
    '29630000-0000-0000-0000-000000000002', 'Paid Company',
    '19630000-0000-0000-0000-000000000002', 'active', NULL, NULL
  );

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  (
    '29630000-0000-0000-0000-000000000001',
    '19630000-0000-0000-0000-000000000002', 'proprietario', true
  ),
  (
    '29630000-0000-0000-0000-000000000002',
    '19630000-0000-0000-0000-000000000002', 'proprietario', true
  );

INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19630000-0000-0000-0000-000000000001',
  '19630000-0000-0000-0000-000000000001'
);

INSERT INTO public.organization_subscriptions(
  organization_id, status, billing_email, access_until, next_payment_at
) VALUES (
  '29630000-0000-0000-0000-000000000002', 'active',
  'archive-owner@fluxa.test', now() + interval '30 days', now() + interval '30 days'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19630000-0000-0000-0000-000000000002', true
);
SELECT throws_ok(
  $$SELECT public.set_platform_organization_archived(
    '29630000-0000-0000-0000-000000000001', true
  )$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary owners cannot archive their company through the platform RPC'
);

SELECT set_config(
  'request.jwt.claim.sub', '19630000-0000-0000-0000-000000000001', true
);
SELECT lives_ok(
  $$SELECT public.set_platform_organization_archived(
    '29630000-0000-0000-0000-000000000001', true
  )$$,
  'platform administrator can archive a trial company'
);
SELECT ok(
  (
    SELECT archived_at IS NOT NULL AND commercial_status = 'suspended'
      FROM public.organizations
     WHERE id = '29630000-0000-0000-0000-000000000001'
  ),
  'archiving preserves the company and suspends commercial access'
);
SELECT ok(
  (
    SELECT archived_at IS NOT NULL
      FROM public.platform_organizations()
     WHERE organization_id = '29630000-0000-0000-0000-000000000001'
  ),
  'archived companies remain visible to the platform administrator'
);
SELECT lives_ok(
  $$SELECT public.set_platform_organization_archived(
    '29630000-0000-0000-0000-000000000001', false
  )$$,
  'platform administrator can restore an archived company'
);
SELECT ok(
  (
    SELECT archived_at IS NULL AND commercial_status = 'suspended'
      FROM public.organizations
     WHERE id = '29630000-0000-0000-0000-000000000001'
  ),
  'restored companies require an explicit commercial reactivation'
);
SELECT throws_ok(
  $$SELECT public.set_platform_organization_archived(
    '29630000-0000-0000-0000-000000000002', true
  )$$,
  '55000', 'SUBSCRIPTION_ACCESS_STILL_ACTIVE',
  'companies with active paid access cannot be archived'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE organization_id = '29630000-0000-0000-0000-000000000001'
       AND action IN ('platform.organization.archived', 'platform.organization.restored')
  ),
  2,
  'archive and restore actions are audited'
);

SELECT * FROM finish();
ROLLBACK;
