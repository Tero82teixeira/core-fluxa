BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public', 'platform_trial_followups', 'platform follow-up table exists');
SELECT has_function(
  'public', 'platform_trial_followups', ARRAY[]::text[],
  'private platform follow-up listing exists'
);
SELECT has_function(
  'public', 'save_platform_trial_followup',
  ARRAY['uuid', 'text', 'timestamp with time zone', 'text', 'boolean'],
  'private platform follow-up write RPC exists'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.platform_trial_followups', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.platform_trial_followups', 'INSERT')
  AND NOT has_function_privilege('anon', 'public.platform_trial_followups()', 'EXECUTE'),
  'tenant and anonymous sessions have no direct follow-up access'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19900000-0000-0000-0000-000000000001', 'followup-admin@fluxa.test',
    '{"full_name":"Admin FLUXA"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19900000-0000-0000-0000-000000000002', 'followup-owner@fluxa.test',
    '{"full_name":"Cliente Trial"}', 'authenticated', 'authenticated', '', now()
  );

UPDATE public.profiles
SET phone = '(28) 99999-9999'
WHERE id = '19900000-0000-0000-0000-000000000002';

INSERT INTO public.organizations(
  id, legal_name, created_by, commercial_status, trial_started_at, trial_ends_at
) VALUES (
  '29900000-0000-0000-0000-000000000001', 'Empresa Trial Follow-up',
  '19900000-0000-0000-0000-000000000002', 'trial', now(), now() + interval '14 days'
);

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES (
  '29900000-0000-0000-0000-000000000001',
  '19900000-0000-0000-0000-000000000002', 'proprietario', true
);

INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19900000-0000-0000-0000-000000000001',
  '19900000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19900000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  $$SELECT * FROM public.platform_trial_followups()$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary company owner cannot read platform follow-ups'
);
SELECT throws_ok(
  $$SELECT public.save_platform_trial_followup(
    '29900000-0000-0000-0000-000000000001', 'interested', now(), 'Private note', true
  )$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary company owner cannot write platform follow-ups'
);

SELECT set_config('request.jwt.claim.sub', '19900000-0000-0000-0000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.save_platform_trial_followup(
    '29900000-0000-0000-0000-000000000001',
    'interested', now() + interval '1 day', 'Cliente pediu uma demonstração.', true
  )$$,
  'platform administrator can save a follow-up'
);
SELECT ok(
  (
    SELECT status = 'interested'
      AND notes = 'Cliente pediu uma demonstração.'
      AND last_contact_at IS NOT NULL
      AND next_contact_at IS NOT NULL
    FROM public.platform_trial_followups()
    WHERE organization_id = '29900000-0000-0000-0000-000000000001'
  ),
  'saved follow-up is returned to the platform administrator'
);
SELECT is(
  (
    SELECT owner_phone
    FROM public.platform_organizations()
    WHERE organization_id = '29900000-0000-0000-0000-000000000001'
  ),
  '(28) 99999-9999',
  'platform administrator receives the owner phone for direct contact'
);
SELECT throws_ok(
  $$SELECT public.save_platform_trial_followup(
    '29900000-0000-0000-0000-000000000001', 'invalid', NULL, NULL, false
  )$$,
  '22023', 'INVALID_FOLLOWUP_STATUS',
  'invalid commercial statuses are rejected'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.audit_logs
    WHERE organization_id = '29900000-0000-0000-0000-000000000001'
      AND action = 'platform.trial_followup.updated'
  ),
  1,
  'successful follow-up updates are audited'
);

SELECT * FROM finish();
ROLLBACK;
