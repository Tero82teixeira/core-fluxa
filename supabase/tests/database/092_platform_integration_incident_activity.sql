BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table(
  'public', 'platform_integration_incident_notes',
  'private platform incident notes table exists'
);
SELECT has_function(
  'public', 'platform_integration_incident_activity',
  ARRAY['uuid', 'text', 'uuid', 'integer'],
  'platform incident activity RPC exists'
);
SELECT has_function(
  'public', 'platform_add_integration_incident_note',
  ARRAY['uuid', 'text', 'uuid', 'text'],
  'platform incident note RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.platform_integration_incident_activity(uuid, text, uuid, integer)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.platform_add_integration_incident_note(uuid, text, uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.platform_add_integration_incident_note(uuid, text, uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.platform_integration_incident_activity(uuid, text, uuid, integer)', 'EXECUTE'
  ),
  'incident activity RPCs are exposed only to authenticated sessions'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.platform_integration_incident_notes', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.platform_integration_incident_notes', 'INSERT'),
  'authenticated users cannot access platform notes directly'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19670000-0000-0000-0000-000000000001', 'activity-platform@fluxa.test',
    '{"full_name":"Activity Platform"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19670000-0000-0000-0000-000000000002', 'activity-owner@fluxa.test',
    '{"full_name":"Activity Owner"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.profiles(id, full_name, email) VALUES
  (
    '19670000-0000-0000-0000-000000000001',
    'Activity Platform', 'activity-platform@fluxa.test'
  ),
  (
    '19670000-0000-0000-0000-000000000002',
    'Activity Owner', 'activity-owner@fluxa.test'
  )
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;

INSERT INTO public.organizations(id, legal_name, trade_name, created_by) VALUES (
  '29670000-0000-0000-0000-000000000001',
  'Activity Customer Ltda', 'Activity Customer',
  '19670000-0000-0000-0000-000000000002'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES (
  '29670000-0000-0000-0000-000000000001',
  '19670000-0000-0000-0000-000000000002', 'proprietario', true
);
INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19670000-0000-0000-0000-000000000001',
  '19670000-0000-0000-0000-000000000001'
);
INSERT INTO public.communication_channel_connections(
  id, organization_id, channel, provider, sender_identifier, display_name,
  status, is_enabled, last_error_code, created_by, updated_by
) VALUES (
  '39670000-0000-0000-0000-000000000001',
  '29670000-0000-0000-0000-000000000001',
  'email', 'resend', 'activity@integration.test', 'Activity Test',
  'error', true, 'PROVIDER_UNAVAILABLE',
  '19670000-0000-0000-0000-000000000002',
  '19670000-0000-0000-0000-000000000002'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19670000-0000-0000-0000-000000000002', true
);
SELECT throws_ok(
  $$SELECT public.platform_add_integration_incident_note(
    '29670000-0000-0000-0000-000000000001', 'channel-email',
    '39670000-0000-0000-0000-000000000001', 'Tenant should not write'
  )$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'organization owner cannot add a private platform note'
);
SELECT throws_ok(
  $$SELECT * FROM public.platform_integration_incident_activity(
    '29670000-0000-0000-0000-000000000001', 'channel-email',
    '39670000-0000-0000-0000-000000000001', 30
  )$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'organization owner cannot read platform activity'
);

SELECT set_config(
  'request.jwt.claim.sub', '19670000-0000-0000-0000-000000000001', true
);
SELECT throws_ok(
  $$SELECT public.platform_add_integration_incident_note(
    '29670000-0000-0000-0000-000000000001', 'channel-email',
    '39670000-0000-0000-0000-000000000001', ' '
  )$$,
  '22023', 'INTEGRATION_INCIDENT_NOTE_INVALID',
  'blank platform notes are rejected'
);
SELECT lives_ok(
  $$SELECT public.platform_manage_integration_incident(
    '29670000-0000-0000-0000-000000000001', 'channel-email',
    '39670000-0000-0000-0000-000000000001', 'acknowledge'
  )$$,
  'platform administrator can create the incident activity'
);
SELECT lives_ok(
  $$SELECT public.platform_add_integration_incident_note(
    '29670000-0000-0000-0000-000000000001', 'channel-email',
    '39670000-0000-0000-0000-000000000001', '  Provider contacted; awaiting confirmation.  '
  )$$,
  'platform administrator can add a note'
);
SELECT is(
  (
    SELECT detail
      FROM public.platform_integration_incident_activity(
        '29670000-0000-0000-0000-000000000001', 'channel-email',
        '39670000-0000-0000-0000-000000000001', 30
      )
     WHERE event_type = 'note'
  ),
  'Provider contacted; awaiting confirmation.',
  'activity returns the trimmed note'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.platform_integration_incident_activity(
        '29670000-0000-0000-0000-000000000001', 'channel-email',
        '39670000-0000-0000-0000-000000000001', 30
      )
     WHERE event_type IN ('note', 'platform.integration_incident.acknowledge')
  ),
  2,
  'activity combines manual notes with audited status changes'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE action = 'platform.integration_incident.note_added'
       AND entity_id = '39670000-0000-0000-0000-000000000001'
       AND metadata ->> 'integration_key' = 'channel-email'
  ),
  1,
  'note creation is audited without copying note content to metadata'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE action = 'platform.integration_incident.note_added'
       AND metadata ? 'note'
  ),
  0,
  'audit metadata does not duplicate private note content'
);

SELECT * FROM finish();
ROLLBACK;
