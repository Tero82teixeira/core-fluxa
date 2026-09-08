BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table(
  'public', 'communication_response_alert_settings',
  'response alert settings table exists'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.communication_response_alert_settings', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT'),
  'alert settings and device details are never directly readable'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19760000-0000-0000-0000-000000000001', 'alerts-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19760000-0000-0000-0000-000000000002', 'alerts-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29760000-0000-0000-0000-000000000001',
  'Response Alerts Tenant',
  '19760000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29760000-0000-0000-0000-000000000001', '19760000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29760000-0000-0000-0000-000000000001', '19760000-0000-0000-0000-000000000002', 'operacional', true);

INSERT INTO public.push_subscriptions(
  organization_id, user_id, endpoint, p256dh, auth_key, user_agent, is_active
) VALUES
  (
    '29760000-0000-0000-0000-000000000001',
    '19760000-0000-0000-0000-000000000002',
    'https://push.example.test/operator-device',
    repeat('p', 24), repeat('a', 12), 'test', true
  ),
  (
    '29760000-0000-0000-0000-000000000001',
    '19760000-0000-0000-0000-000000000001',
    'https://push.example.test/disabled-owner-device',
    repeat('p', 24), repeat('a', 12), 'test', false
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19760000-0000-0000-0000-000000000001', true
);

SELECT is(
  (
    SELECT first_reminder_minutes
    FROM public.update_communication_response_alert_settings(
      '29760000-0000-0000-0000-000000000001', 20, 45
    )
  ),
  20,
  'owner configures the first reminder'
);
SELECT is(
  (
    SELECT escalation_minutes
    FROM public.get_communication_response_alert_settings(
      '29760000-0000-0000-0000-000000000001'
    )
  ),
  45,
  'saved escalation is returned to active members'
);
SELECT is(
  (
    SELECT active_device_count
    FROM public.list_team_push_status('29760000-0000-0000-0000-000000000001')
    WHERE user_id = '19760000-0000-0000-0000-000000000002'
  ),
  1::bigint,
  'management sees only the active-device count'
);
SELECT is(
  (
    SELECT ever_registered
    FROM public.list_team_push_status('29760000-0000-0000-0000-000000000001')
    WHERE user_id = '19760000-0000-0000-0000-000000000001'
  ),
  true,
  'management can distinguish a disabled device from never configured'
);
SELECT ok(
  public.remind_member_push_activation(
    '29760000-0000-0000-0000-000000000001',
    '19760000-0000-0000-0000-000000000001'
  ),
  'management can send one activation reminder'
);
SELECT ok(
  NOT public.remind_member_push_activation(
    '29760000-0000-0000-0000-000000000001',
    '19760000-0000-0000-0000-000000000001'
  ),
  'activation reminder is deduplicated during the same day'
);

SELECT set_config(
  'request.jwt.claim.sub', '19760000-0000-0000-0000-000000000002', true
);
SELECT lives_ok(
  $$SELECT public.get_communication_response_alert_settings(
    '29760000-0000-0000-0000-000000000001'
  )$$,
  'active operator may read response deadlines'
);
SELECT throws_ok(
  $$SELECT public.update_communication_response_alert_settings(
    '29760000-0000-0000-0000-000000000001', 20, 45
  )$$,
  'COMMUNICATION_ALERT_SETTINGS_PERMISSION_DENIED',
  'operator cannot alter response deadlines'
);
SELECT throws_ok(
  $$SELECT public.list_team_push_status(
    '29760000-0000-0000-0000-000000000001'
  )$$,
  'TEAM_PUSH_STATUS_PERMISSION_DENIED',
  'operator cannot inspect team device readiness'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
