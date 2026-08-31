BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'enforce_organization_member_limit', ARRAY[]::text[],
  'database member limit guard exists'
);
SELECT has_function(
  'public', 'enforce_organization_invitation_limit', ARRAY[]::text[],
  'database invitation limit guard exists'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger AS trigger_row
     WHERE trigger_row.tgrelid = 'public.organization_members'::regclass
       AND trigger_row.tgname = 'organization_members_limit_guard'
       AND NOT trigger_row.tgisinternal
  ),
  'member limit guard is attached to organization memberships'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_trigger AS trigger_row
     WHERE trigger_row.tgrelid = 'public.organization_invitations'::regclass
       AND trigger_row.tgname = 'organization_invitations_limit_guard'
       AND NOT trigger_row.tgisinternal
  ),
  'invitation limit guard is attached to organization invitations'
);
SELECT ok(
  has_function_privilege(
    'postgres', 'public.enforce_organization_member_limit()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.enforce_organization_member_limit()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.enforce_organization_member_limit()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.enforce_organization_invitation_limit()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.enforce_organization_invitation_limit()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.enforce_organization_invitation_limit()', 'EXECUTE'
  ),
  'only the database owner can execute the trigger helpers directly'
);
SELECT ok(
  pg_get_functiondef(
    'public.create_invitation(uuid,text,public.app_role)'::regprocedure
  ) LIKE '%pg_advisory_xact_lock%'
  AND pg_get_functiondef(
    'public.create_invitation(uuid,text,public.app_role)'::regprocedure
  ) LIKE '%ORGANIZATION_MEMBER_LIMIT_REACHED%'
  AND pg_get_functiondef(
    'public.accept_invitation(text)'::regprocedure
  ) LIKE '%pg_advisory_xact_lock%'
  AND strpos(
    pg_get_functiondef('public.accept_invitation(text)'::regprocedure),
    'pg_advisory_xact_lock'
  ) < strpos(
    pg_get_functiondef('public.accept_invitation(text)'::regprocedure),
    'FOR UPDATE'
  ),
  'invitation creation and acceptance serialize seat changes'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  (
    '19610000-0000-0000-0000-000000000001',
    'team-limit-1@fluxa.test', '{"full_name":"Team Limit 1"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19610000-0000-0000-0000-000000000002',
    'team-limit-2@fluxa.test', '{"full_name":"Team Limit 2"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19610000-0000-0000-0000-000000000003',
    'team-limit-3@fluxa.test', '{"full_name":"Team Limit 3"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19610000-0000-0000-0000-000000000004',
    'team-limit-4@fluxa.test', '{"full_name":"Team Limit 4"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19610000-0000-0000-0000-000000000005',
    'team-limit-5@fluxa.test', '{"full_name":"Team Limit 5"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19610000-0000-0000-0000-000000000006',
    'team-limit-6@fluxa.test', '{"full_name":"Team Limit 6"}',
    'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name) VALUES (
  '29610000-0000-0000-0000-000000000001', 'Team Limit Tenant'
);

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29610000-0000-0000-0000-000000000001',
    '19610000-0000-0000-0000-000000000001', 'proprietario', true
  ),
  (
    '29610000-0000-0000-0000-000000000001',
    '19610000-0000-0000-0000-000000000002', 'administrador', true
  ),
  (
    '29610000-0000-0000-0000-000000000001',
    '19610000-0000-0000-0000-000000000003', 'gestor', true
  ),
  (
    '29610000-0000-0000-0000-000000000001',
    '19610000-0000-0000-0000-000000000004', 'operacional', true
  ),
  (
    '29610000-0000-0000-0000-000000000001',
    '19610000-0000-0000-0000-000000000005', 'visualizador', true
  );

SELECT throws_ok(
  $$INSERT INTO public.organization_members(
      organization_id, user_id, role, is_active
    ) VALUES (
      '29610000-0000-0000-0000-000000000001',
      '19610000-0000-0000-0000-000000000006', 'operacional', true
    )$$,
  'P0001', 'ORGANIZATION_MEMBER_LIMIT_REACHED',
  'the sixth active member is rejected at the database boundary'
);

UPDATE public.organization_members
   SET is_active = false
 WHERE organization_id = '29610000-0000-0000-0000-000000000001'
   AND user_id = '19610000-0000-0000-0000-000000000005';

INSERT INTO public.organization_invitations(
  organization_id, email, role, token_hash, expires_at
) VALUES (
  '29610000-0000-0000-0000-000000000001',
  'reserved-seat@fluxa.test', 'operacional',
  encode(extensions.digest('reserved-seat-token', 'sha256'), 'hex'),
  now() + interval '7 days'
);

SELECT throws_ok(
  $$INSERT INTO public.organization_invitations(
      organization_id, email, role, token_hash, expires_at
    ) VALUES (
      '29610000-0000-0000-0000-000000000001',
      'sixth-reservation@fluxa.test', 'operacional',
      encode(extensions.digest('sixth-reservation-token', 'sha256'), 'hex'),
      now() + interval '7 days'
    )$$,
  'P0001', 'ORGANIZATION_MEMBER_LIMIT_REACHED',
  'a sixth reservation is rejected even outside the invitation RPC'
);

SELECT throws_ok(
  $$UPDATE public.organization_members
       SET is_active = true
     WHERE organization_id = '29610000-0000-0000-0000-000000000001'
       AND user_id = '19610000-0000-0000-0000-000000000005'$$,
  'P0001', 'ORGANIZATION_MEMBER_LIMIT_REACHED',
  'a valid pending invitation reserves the fifth seat'
);

UPDATE public.organization_invitations
   SET status = 'cancelled', cancelled_at = now()
 WHERE organization_id = '29610000-0000-0000-0000-000000000001'
   AND email = 'reserved-seat@fluxa.test';

SELECT lives_ok(
  $$UPDATE public.organization_members
       SET is_active = true
     WHERE organization_id = '29610000-0000-0000-0000-000000000001'
       AND user_id = '19610000-0000-0000-0000-000000000005'$$,
  'cancelling the invitation releases its seat'
);

SELECT * FROM finish();
ROLLBACK;
