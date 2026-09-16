BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'platform_integration_incidents', ARRAY['boolean', 'integer'],
  'platform integration incident queue RPC exists'
);
SELECT has_function(
  'public', 'platform_manage_integration_incident',
  ARRAY['uuid', 'text', 'uuid', 'text'],
  'platform integration incident action RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.platform_integration_incidents(boolean, integer)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.platform_manage_integration_incident(uuid, text, uuid, text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.platform_integration_incidents(boolean, integer)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.platform_integration_incidents(boolean, integer)', 'EXECUTE'
  ),
  'platform incident RPCs are exposed only to authenticated sessions'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19660000-0000-0000-0000-000000000001', 'integration-platform@fluxa.test',
    '{"full_name":"Integration Platform"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19660000-0000-0000-0000-000000000002', 'integration-owner@fluxa.test',
    '{"full_name":"Integration Owner"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.profiles(id, full_name, email) VALUES
  (
    '19660000-0000-0000-0000-000000000001',
    'Integration Platform', 'integration-platform@fluxa.test'
  ),
  (
    '19660000-0000-0000-0000-000000000002',
    'Integration Owner', 'integration-owner@fluxa.test'
  )
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;

INSERT INTO public.organizations(id, legal_name, trade_name, created_by) VALUES (
  '29660000-0000-0000-0000-000000000001',
  'Integration Customer Ltda', 'Integration Customer',
  '19660000-0000-0000-0000-000000000002'
);

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES (
  '29660000-0000-0000-0000-000000000001',
  '19660000-0000-0000-0000-000000000002', 'proprietario', true
);

INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19660000-0000-0000-0000-000000000001',
  '19660000-0000-0000-0000-000000000001'
);

INSERT INTO public.communication_channel_connections(
  id, organization_id, channel, provider, sender_identifier, display_name,
  status, is_enabled, last_error_code, created_by, updated_by
) VALUES (
  '39660000-0000-0000-0000-000000000001',
  '29660000-0000-0000-0000-000000000001',
  'email', 'resend', 'support@integration.test', 'Integration Test',
  'error', true, 'PROVIDER_UNAVAILABLE',
  '19660000-0000-0000-0000-000000000002',
  '19660000-0000-0000-0000-000000000002'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19660000-0000-0000-0000-000000000002', true
);
SELECT throws_ok(
  $$SELECT * FROM public.platform_integration_incidents(false, 100)$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary organization owners cannot open the platform incident queue'
);
SELECT throws_ok(
  $$SELECT public.platform_manage_integration_incident(
    '29660000-0000-0000-0000-000000000001',
    'channel-email',
    '39660000-0000-0000-0000-000000000001',
    'acknowledge'
  )$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary organization owners cannot manage platform incidents'
);

SELECT set_config(
  'request.jwt.claim.sub', '19660000-0000-0000-0000-000000000001', true
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.platform_integration_incidents(false, 100)
     WHERE organization_id = '29660000-0000-0000-0000-000000000001'
       AND status = 'open'
       AND is_active_failure
  ),
  1,
  'platform administrator sees the active failure without tenant membership'
);
SELECT is(
  (
    SELECT organization_name
      FROM public.platform_integration_incidents(false, 100)
     WHERE failure_id = '39660000-0000-0000-0000-000000000001'
  ),
  'Integration Customer',
  'queue identifies the affected organization'
);
SELECT lives_ok(
  $$SELECT public.platform_manage_integration_incident(
    '29660000-0000-0000-0000-000000000001',
    'channel-email',
    '39660000-0000-0000-0000-000000000001',
    'acknowledge'
  )$$,
  'platform administrator can take ownership of an active failure'
);
SELECT is(
  (
    SELECT status
      FROM public.platform_integration_incidents(false, 100)
     WHERE failure_id = '39660000-0000-0000-0000-000000000001'
  ),
  'in_progress',
  'taking ownership moves the incident into progress'
);
SELECT is(
  (
    SELECT assigned_to
      FROM public.platform_integration_incidents(false, 100)
     WHERE failure_id = '39660000-0000-0000-0000-000000000001'
  ),
  '19660000-0000-0000-0000-000000000001'::uuid,
  'taking ownership assigns the platform administrator'
);
RESET ROLE;

UPDATE public.communication_channel_connections
   SET status = 'active', last_error_code = NULL
 WHERE id = '39660000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19660000-0000-0000-0000-000000000001', true
);
SELECT is(
  (
    SELECT status
      FROM public.platform_integration_incidents(true, 100)
     WHERE failure_id = '39660000-0000-0000-0000-000000000001'
  ),
  'resolved',
  'real provider recovery closes the tracked incident automatically'
);
SELECT is(
  (
    SELECT is_active_failure
      FROM public.platform_integration_incidents(true, 100)
     WHERE failure_id = '39660000-0000-0000-0000-000000000001'
  ),
  false,
  'resolved history no longer reports an active technical failure'
);
SELECT lives_ok(
  $$SELECT public.platform_manage_integration_incident(
    '29660000-0000-0000-0000-000000000001',
    'channel-email',
    '39660000-0000-0000-0000-000000000001',
    'reopen'
  )$$,
  'platform administrator can reopen historical follow-up'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE organization_id = '29660000-0000-0000-0000-000000000001'
       AND action IN (
         'platform.integration_incident.acknowledge',
         'platform.integration_incident.reopen'
       )
  ),
  2,
  'platform incident actions are audited'
);

SELECT * FROM finish();
ROLLBACK;
