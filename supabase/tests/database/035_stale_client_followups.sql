BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_stale_client_notifications',
  ARRAY['timestamp with time zone'],
  'private stale-client helper exists'
);
SELECT has_function(
  'public', 'sync_client_last_interaction_from_communication',
  ARRAY[]::text[],
  'private client-interaction trigger helper exists'
);
SELECT has_trigger(
  'public', 'communication_entries',
  'communication_contact_updates_client_interaction',
  'confirmed communication contacts update the client interaction'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_stale_client_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_stale_client_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_stale_client_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_stale_client_notifications(timestamp with time zone)',
    'EXECUTE'
  ),
  'only postgres can invoke the stale-client helper'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.sync_client_last_interaction_from_communication()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.sync_client_last_interaction_from_communication()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.sync_client_last_interaction_from_communication()',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.sync_client_last_interaction_from_communication()',
    'EXECUTE'
  ),
  'the trigger helper has no client-facing execution grant'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('19800000-0000-0000-0000-000000000001', 'client-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000002', 'client-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000003', 'client-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000004', 'client-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000005', 'client-archived@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, archived_at) VALUES
  ('29800000-0000-0000-0000-000000000001', 'Stale Client Tenant', NULL),
  ('29800000-0000-0000-0000-000000000002', 'Archived Client Tenant', now());

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000002', 'administrador', true),
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000003', 'operacional', true),
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000004', 'operacional', true),
  ('29800000-0000-0000-0000-000000000002', '19800000-0000-0000-0000-000000000005', 'proprietario', true);

INSERT INTO public.organization_settings(organization_id, timezone) VALUES
  ('29800000-0000-0000-0000-000000000001', 'America/Sao_Paulo'),
  ('29800000-0000-0000-0000-000000000002', 'America/Sao_Paulo');

INSERT INTO public.clients(
  id, organization_id, name, status, owner_id, last_interaction_at,
  created_at, created_by, archived_at
) VALUES
  ('39800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', 'Stale Owned Client', 'ativo', '19800000-0000-0000-0000-000000000003', '2026-07-20 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000001', NULL),
  ('39800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000001', 'Stale Unassigned Client', 'ativo', NULL, '2026-07-20 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000001', NULL),
  ('39800000-0000-0000-0000-000000000003', '29800000-0000-0000-0000-000000000001', 'Fresh Client', 'ativo', '19800000-0000-0000-0000-000000000003', '2026-08-20 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000001', NULL),
  ('39800000-0000-0000-0000-000000000004', '29800000-0000-0000-0000-000000000001', 'Archived Client', 'arquivado', '19800000-0000-0000-0000-000000000003', '2026-07-01 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00'),
  ('39800000-0000-0000-0000-000000000005', '29800000-0000-0000-0000-000000000001', 'Inactive Client', 'inativo', '19800000-0000-0000-0000-000000000003', '2026-07-01 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000001', NULL),
  ('39800000-0000-0000-0000-000000000006', '29800000-0000-0000-0000-000000000001', 'Inactive Owner Client', 'ativo', '19800000-0000-0000-0000-000000000004', '2026-07-20 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000001', NULL),
  ('39800000-0000-0000-0000-000000000007', '29800000-0000-0000-0000-000000000002', 'Archived Tenant Client', 'ativo', '19800000-0000-0000-0000-000000000005', '2026-07-01 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000005', NULL),
  ('39800000-0000-0000-0000-000000000008', '29800000-0000-0000-0000-000000000001', 'Contact Tracking Client', 'ativo', '19800000-0000-0000-0000-000000000003', '2026-07-01 12:00:00+00', '2026-07-01 12:00:00+00', '19800000-0000-0000-0000-000000000001', NULL);

-- The assignment was valid when created; this tests the management fallback.
UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '29800000-0000-0000-0000-000000000001'
  AND user_id = '19800000-0000-0000-0000-000000000004';

INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, status, priority, assigned_to,
  created_by, archived_at
) VALUES (
  '49800000-0000-0000-0000-000000000001',
  '29800000-0000-0000-0000-000000000001',
  '39800000-0000-0000-0000-000000000008',
  'Contact tracking', 'aberta', 'normal',
  '19800000-0000-0000-0000-000000000003',
  '19800000-0000-0000-0000-000000000001', NULL
);

INSERT INTO public.communication_entries(
  id, organization_id, thread_id, entry_type, content, created_by,
  occurred_at, contact_made
) VALUES (
  '59800000-0000-0000-0000-000000000001',
  '29800000-0000-0000-0000-000000000001',
  '49800000-0000-0000-0000-000000000001',
  'nota_interna', 'Administrative note',
  '19800000-0000-0000-0000-000000000001',
  '2026-08-19 12:00:00+00', false
);

SELECT is(
  (
    SELECT last_interaction_at
    FROM public.clients
    WHERE id = '39800000-0000-0000-0000-000000000008'
  ),
  '2026-07-01 12:00:00+00'::timestamptz,
  'an internal note without confirmed contact does not renew interaction'
);

INSERT INTO public.communication_entries(
  id, organization_id, thread_id, entry_type, content, created_by,
  occurred_at, contact_made
) VALUES (
  '59800000-0000-0000-0000-000000000002',
  '29800000-0000-0000-0000-000000000001',
  '49800000-0000-0000-0000-000000000001',
  'ligacao', 'Confirmed client call',
  '19800000-0000-0000-0000-000000000003',
  '2026-08-20 12:00:00+00', true
);

SELECT is(
  (
    SELECT last_interaction_at
    FROM public.clients
    WHERE id = '39800000-0000-0000-0000-000000000008'
  ),
  '2026-08-20 12:00:00+00'::timestamptz,
  'a confirmed contact renews the client interaction timestamp'
);

INSERT INTO public.communication_entries(
  id, organization_id, thread_id, entry_type, content, created_by,
  occurred_at, contact_made
) VALUES (
  '59800000-0000-0000-0000-000000000003',
  '29800000-0000-0000-0000-000000000001',
  '49800000-0000-0000-0000-000000000001',
  'email', 'Older confirmed contact entered later',
  '19800000-0000-0000-0000-000000000003',
  '2026-08-10 12:00:00+00', true
);

SELECT is(
  (
    SELECT last_interaction_at
    FROM public.clients
    WHERE id = '39800000-0000-0000-0000-000000000008'
  ),
  '2026-08-20 12:00:00+00'::timestamptz,
  'an older confirmed contact never regresses the last interaction'
);

SELECT is(
  public.create_stale_client_notifications('2026-08-25 10:59:00+00'),
  0,
  'the stale-client scan does not run before 08:00 local time'
);
SELECT is(
  public.create_stale_client_notifications('2026-08-25 12:00:00+00'),
  5,
  'stale clients notify an active owner or active management fallback'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url = '/clientes/39800000-0000-0000-0000-000000000001'
      AND user_id = '19800000-0000-0000-0000-000000000003'
      AND dedupe_key LIKE 'stale-client:%'
  ),
  1::bigint,
  'the active operational owner receives the client notification'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url IN (
      '/clientes/39800000-0000-0000-0000-000000000002',
      '/clientes/39800000-0000-0000-0000-000000000006'
    )
      AND user_id IN (
        '19800000-0000-0000-0000-000000000001',
        '19800000-0000-0000-0000-000000000002'
      )
      AND dedupe_key LIKE 'stale-client:%'
  ),
  4::bigint,
  'unassigned or inactive ownership falls back to active management'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url IN (
      '/clientes/39800000-0000-0000-0000-000000000003',
      '/clientes/39800000-0000-0000-0000-000000000004',
      '/clientes/39800000-0000-0000-0000-000000000005',
      '/clientes/39800000-0000-0000-0000-000000000007',
      '/clientes/39800000-0000-0000-0000-000000000008'
    )
      AND dedupe_key LIKE 'stale-client:%'
  ),
  0::bigint,
  'fresh, archived, inactive and archived-tenant clients are ignored'
);
SELECT is(
  public.create_stale_client_notifications('2026-08-25 12:15:00+00'),
  0,
  'the same inactivity episode is idempotent'
);

UPDATE public.clients
SET last_interaction_at = '2026-08-25 12:00:00+00'
WHERE id = '39800000-0000-0000-0000-000000000001';

SELECT is(
  public.create_stale_client_notifications('2026-08-25 12:30:00+00'),
  0,
  'a fresh contact clears the stale condition immediately'
);

-- Keep the two previously fresh fixtures below the threshold in September so
-- the next assertion isolates the new episode of the first client.
UPDATE public.clients
SET last_interaction_at = '2026-09-01 12:00:00+00'
WHERE id IN (
  '39800000-0000-0000-0000-000000000003',
  '39800000-0000-0000-0000-000000000008'
);

SELECT is(
  public.create_stale_client_notifications('2026-09-25 12:00:00+00'),
  1,
  'a later 30-day episode can notify the responsible person again'
);
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the stale-client scan creates no additional clock'
);
SELECT is(
  (
    SELECT command
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  'SELECT public.run_temporal_automation_cycle();',
  'the private temporal command remains unchanged'
);
SELECT ok(
  pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%stale_client_notifications_created%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_stale_client_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_weekly_data_quality_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_weekly_financial_summary_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%process_due_financial_recurrences()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_overdue_financial_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_expired_document_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_overdue_communication_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_stale_process_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_overdue_task_escalation_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_deadline_reminder_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_unassigned_monitoring_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_critical_monitoring_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%process_due_scheduled_automations()%',
  'the temporal cycle preserves every prior stage and adds stale clients'
);

SELECT * FROM finish();
ROLLBACK;
