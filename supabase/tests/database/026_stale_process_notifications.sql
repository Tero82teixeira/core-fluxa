BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SELECT no_plan();

SELECT has_function(
  'public', 'create_stale_process_notifications', ARRAY[]::text[],
  'private stale-process notification helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_stale_process_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.create_stale_process_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.create_stale_process_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.create_stale_process_notifications()', 'EXECUTE'
  ),
  'only postgres can invoke the stale-process helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19300000-0000-0000-0000-000000000001', 'stale-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19300000-0000-0000-0000-000000000002', 'stale-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19300000-0000-0000-0000-000000000003', 'stale-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19300000-0000-0000-0000-000000000004', 'stale-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19300000-0000-0000-0000-000000000005', 'stale-other@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29300000-0000-0000-0000-000000000001', 'Stale Process Tenant'),
  ('29300000-0000-0000-0000-000000000002', 'Disabled Stale Process Tenant');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29300000-0000-0000-0000-000000000001', '19300000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29300000-0000-0000-0000-000000000001', '19300000-0000-0000-0000-000000000002', 'administrador', true),
  ('29300000-0000-0000-0000-000000000001', '19300000-0000-0000-0000-000000000003', 'operacional', true),
  ('29300000-0000-0000-0000-000000000001', '19300000-0000-0000-0000-000000000004', 'operacional', true),
  ('29300000-0000-0000-0000-000000000002', '19300000-0000-0000-0000-000000000005', 'operacional', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, stale_process_days
) VALUES
  ('29300000-0000-0000-0000-000000000001', 'America/Sao_Paulo', 14),
  ('29300000-0000-0000-0000-000000000002', 'America/Sao_Paulo', 14);
UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{stale_processes}', 'false'::jsonb, true
)
WHERE organization_id = '29300000-0000-0000-0000-000000000002';

INSERT INTO public.clients(id, organization_id, name, created_by) VALUES
  ('39300000-0000-0000-0000-000000000001', '29300000-0000-0000-0000-000000000001', 'Stale Process Client', '19300000-0000-0000-0000-000000000001'),
  ('39300000-0000-0000-0000-000000000002', '29300000-0000-0000-0000-000000000002', 'Disabled Stale Client', '19300000-0000-0000-0000-000000000005');

INSERT INTO public.processes(
  id, organization_id, code, client_id, title, stage, priority, owner_id,
  last_movement_at, archived_at, created_by
) VALUES
  ('49300000-0000-0000-0000-000000000001', '29300000-0000-0000-0000-000000000001', 'STALE-001', '39300000-0000-0000-0000-000000000001', 'First stale notice', 'em_analise', 'media', '19300000-0000-0000-0000-000000000003', (current_date - 14)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000002', '29300000-0000-0000-0000-000000000001', 'STALE-002', '39300000-0000-0000-0000-000000000001', 'Escalated stale notice', 'em_analise', 'media', '19300000-0000-0000-0000-000000000003', (current_date - 21)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000003', '29300000-0000-0000-0000-000000000001', 'STALE-003', '39300000-0000-0000-0000-000000000001', 'Critical stale process', 'em_analise', 'critica', '19300000-0000-0000-0000-000000000003', (current_date - 14)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000004', '29300000-0000-0000-0000-000000000001', 'STALE-004', '39300000-0000-0000-0000-000000000001', 'Resolved stale process', 'em_analise', 'media', '19300000-0000-0000-0000-000000000003', (current_date - 14)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000005', '29300000-0000-0000-0000-000000000001', 'STALE-005', '39300000-0000-0000-0000-000000000001', 'Unassigned stale process', 'em_analise', 'media', NULL, (current_date - 14)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000006', '29300000-0000-0000-0000-000000000001', 'STALE-006', '39300000-0000-0000-0000-000000000001', 'Inactive owner stale process', 'em_analise', 'media', '19300000-0000-0000-0000-000000000004', (current_date - 14)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000007', '29300000-0000-0000-0000-000000000001', 'STALE-007', '39300000-0000-0000-0000-000000000001', 'Archived stale process', 'em_analise', 'media', '19300000-0000-0000-0000-000000000003', (current_date - 21)::timestamp AT TIME ZONE 'America/Sao_Paulo', now(), '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000008', '29300000-0000-0000-0000-000000000001', 'STALE-008', '39300000-0000-0000-0000-000000000001', 'Final stale process', 'finalizado', 'media', '19300000-0000-0000-0000-000000000003', (current_date - 21)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001'),
  ('49300000-0000-0000-0000-000000000009', '29300000-0000-0000-0000-000000000002', 'STALE-009', '39300000-0000-0000-0000-000000000002', 'Preference disabled stale process', 'em_analise', 'media', '19300000-0000-0000-0000-000000000005', (current_date - 14)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000005'),
  ('49300000-0000-0000-0000-000000000010', '29300000-0000-0000-0000-000000000001', 'STALE-010', '39300000-0000-0000-0000-000000000001', 'Owner is responsible', 'em_analise', 'media', '19300000-0000-0000-0000-000000000001', (current_date - 21)::timestamp AT TIME ZONE 'America/Sao_Paulo', NULL, '19300000-0000-0000-0000-000000000001');

INSERT INTO public.monitoring_states(
  id, organization_id, source_type, source_id, alert_kind,
  monitoring_status, assigned_to
) VALUES
  ('59300000-0000-0000-0000-000000000001', '29300000-0000-0000-0000-000000000001', 'processo', '49300000-0000-0000-0000-000000000001', 'processo_sem_movimentacao', 'novo', '19300000-0000-0000-0000-000000000002'),
  ('59300000-0000-0000-0000-000000000002', '29300000-0000-0000-0000-000000000001', 'processo', '49300000-0000-0000-0000-000000000004', 'processo_sem_movimentacao', 'resolvido', NULL);

-- The owner was active when assigned and later became inactive.
UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '29300000-0000-0000-0000-000000000001'
  AND user_id = '19300000-0000-0000-0000-000000000004';

SELECT is(
  public.create_stale_process_notifications(), 6,
  'the first and escalated stages create exactly six recipient notifications'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49300000-0000-0000-0000-000000000001'
     AND user_id = '19300000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'stale-process:%'),
  1::bigint,
  'an active monitoring assignee takes precedence over the process owner'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49300000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'stale-process:%'),
  3::bigint,
  'after seven more days the responsible and active management are notified'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49300000-0000-0000-0000-000000000010'
     AND dedupe_key LIKE 'stale-process:%'),
  2::bigint,
  'a manager who is also responsible receives an escalated notice only once'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id IN (
     '49300000-0000-0000-0000-000000000003',
     '49300000-0000-0000-0000-000000000004',
     '49300000-0000-0000-0000-000000000005',
     '49300000-0000-0000-0000-000000000006',
     '49300000-0000-0000-0000-000000000007',
     '49300000-0000-0000-0000-000000000008',
     '49300000-0000-0000-0000-000000000009'
   ) AND dedupe_key LIKE 'stale-process:%'),
  0::bigint,
  'critical, resolved, unassigned, inactive, closed and disabled items are excluded'
);
SELECT is(
  public.create_stale_process_notifications(), 0,
  'replaying the same inactivity episode creates no duplicate'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'false'::jsonb, true
)
WHERE organization_id = '29300000-0000-0000-0000-000000000001';
SELECT is(
  public.create_stale_process_notifications(), 1,
  'a critical process still gets its stale notice when critical alerts are disabled'
);
SELECT is(
  public.create_stale_process_notifications(), 0,
  'the critical-preference fallback is also idempotent'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'true'::jsonb, true
)
WHERE organization_id = '29300000-0000-0000-0000-000000000001';
UPDATE public.processes
SET last_movement_at =
  (current_date - 21)::timestamp AT TIME ZONE 'America/Sao_Paulo'
WHERE id = '49300000-0000-0000-0000-000000000001';
SELECT is(
  public.create_stale_process_notifications(), 2,
  'a new movement episode can later escalate to responsible and management'
);
SELECT is(
  public.create_stale_process_notifications(), 0,
  'the new movement episode remains idempotent on replay'
);

SELECT is(
  (SELECT stage::text FROM public.processes
   WHERE id = '49300000-0000-0000-0000-000000000002'),
  'em_analise',
  'the scan never changes the process stage'
);
SELECT is(
  (SELECT count(*) FROM public.tasks
   WHERE organization_id = '29300000-0000-0000-0000-000000000001'),
  0::bigint,
  'the scan never creates a task'
);
SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'stale-process notifications create no additional clock'
);
SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing private temporal command remains unchanged'
);

SELECT * FROM finish();
ROLLBACK;
