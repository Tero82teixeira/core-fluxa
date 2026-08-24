BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SELECT no_plan();

SELECT has_function(
  'public', 'create_overdue_task_escalation_notifications', ARRAY[]::text[],
  'private overdue-task escalation helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_overdue_task_escalation_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_overdue_task_escalation_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_overdue_task_escalation_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_overdue_task_escalation_notifications()', 'EXECUTE'
  ),
  'only postgres can invoke the overdue-task escalation helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19290000-0000-0000-0000-000000000001', 'escalation-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19290000-0000-0000-0000-000000000002', 'escalation-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19290000-0000-0000-0000-000000000003', 'escalation-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19290000-0000-0000-0000-000000000004', 'escalation-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19290000-0000-0000-0000-000000000005', 'escalation-other@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29290000-0000-0000-0000-000000000001', 'Escalation Tenant'),
  ('29290000-0000-0000-0000-000000000002', 'Disabled Escalation Tenant');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29290000-0000-0000-0000-000000000001', '19290000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29290000-0000-0000-0000-000000000001', '19290000-0000-0000-0000-000000000002', 'administrador', true),
  ('29290000-0000-0000-0000-000000000001', '19290000-0000-0000-0000-000000000003', 'operacional', true),
  ('29290000-0000-0000-0000-000000000001', '19290000-0000-0000-0000-000000000004', 'operacional', true),
  ('29290000-0000-0000-0000-000000000002', '19290000-0000-0000-0000-000000000005', 'operacional', true);

INSERT INTO public.organization_settings(organization_id, timezone) VALUES
  ('29290000-0000-0000-0000-000000000001', 'America/Sao_Paulo'),
  ('29290000-0000-0000-0000-000000000002', 'America/Sao_Paulo');
UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{overdue_tasks}', 'false'::jsonb, true
)
WHERE organization_id = '29290000-0000-0000-0000-000000000002';

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id,
  archived_at, created_by
) VALUES
  ('49290000-0000-0000-0000-000000000001', '29290000-0000-0000-0000-000000000001', 'One day late', 'pendente', 'media', (current_date - 1)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000003', NULL, '19290000-0000-0000-0000-000000000001'),
  ('49290000-0000-0000-0000-000000000002', '29290000-0000-0000-0000-000000000001', 'Three days late', 'pendente', 'media', (current_date - 3)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000003', NULL, '19290000-0000-0000-0000-000000000001'),
  ('49290000-0000-0000-0000-000000000003', '29290000-0000-0000-0000-000000000001', 'Seven days late', 'pendente', 'media', (current_date - 7)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000003', NULL, '19290000-0000-0000-0000-000000000001'),
  ('49290000-0000-0000-0000-000000000004', '29290000-0000-0000-0000-000000000001', 'Unassigned late', 'pendente', 'media', (current_date - 3)::timestamp AT TIME ZONE 'UTC', NULL, NULL, '19290000-0000-0000-0000-000000000001'),
  ('49290000-0000-0000-0000-000000000005', '29290000-0000-0000-0000-000000000001', 'Inactive assignee late', 'pendente', 'media', (current_date - 3)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000004', NULL, '19290000-0000-0000-0000-000000000001'),
  ('49290000-0000-0000-0000-000000000006', '29290000-0000-0000-0000-000000000001', 'Cancelled late', 'cancelada', 'media', (current_date - 7)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000003', NULL, '19290000-0000-0000-0000-000000000001'),
  ('49290000-0000-0000-0000-000000000007', '29290000-0000-0000-0000-000000000001', 'Archived late', 'pendente', 'media', (current_date - 7)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000003', now(), '19290000-0000-0000-0000-000000000001'),
  ('49290000-0000-0000-0000-000000000008', '29290000-0000-0000-0000-000000000002', 'Disabled tenant late', 'pendente', 'media', (current_date - 1)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000005', NULL, '19290000-0000-0000-0000-000000000005'),
  ('49290000-0000-0000-0000-000000000009', '29290000-0000-0000-0000-000000000001', 'Owner assigned three days late', 'pendente', 'media', (current_date - 3)::timestamp AT TIME ZONE 'UTC', '19290000-0000-0000-0000-000000000001', NULL, '19290000-0000-0000-0000-000000000001');

-- The assignment was valid when created; the member later became inactive.
UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '29290000-0000-0000-0000-000000000001'
  AND user_id = '19290000-0000-0000-0000-000000000004';

SELECT is(
  public.create_overdue_task_escalation_notifications(), 8,
  'the 1, 3 and 7 day ladder creates exactly eight recipient notifications'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id = '19290000-0000-0000-0000-000000000003'
     AND dedupe_key LIKE 'overdue-task-escalation:%'),
  2::bigint,
  'the responsible receives the 1 and 3 day stages'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id IN (
     '19290000-0000-0000-0000-000000000001',
     '19290000-0000-0000-0000-000000000002'
   ) AND dedupe_key LIKE 'overdue-task-escalation:%'),
  6::bigint,
  'active owners and administrators receive the 3 and 7 day stages'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49290000-0000-0000-0000-000000000009'
     AND dedupe_key LIKE 'overdue-task-escalation:%'),
  2::bigint,
  'an owner who is also responsible receives the 3 day stage only once'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id IN (
     '19290000-0000-0000-0000-000000000004',
     '19290000-0000-0000-0000-000000000005'
   ) AND dedupe_key LIKE 'overdue-task-escalation:%'),
  0::bigint,
  'inactive and preference-disabled cross-tenant members receive nothing'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id IN (
     '49290000-0000-0000-0000-000000000004',
     '49290000-0000-0000-0000-000000000005',
     '49290000-0000-0000-0000-000000000006',
     '49290000-0000-0000-0000-000000000007'
   ) AND dedupe_key LIKE 'overdue-task-escalation:%'),
  0::bigint,
  'unassigned, inactive, cancelled and archived tasks are excluded'
);
SELECT is(
  public.create_overdue_task_escalation_notifications(), 0,
  'replaying the same overdue stages creates no duplicate'
);

UPDATE public.tasks
SET due_at = (current_date - 3)::timestamp AT TIME ZONE 'UTC'
WHERE id = '49290000-0000-0000-0000-000000000001';
SELECT is(
  public.create_overdue_task_escalation_notifications(), 3,
  'changing the due date starts the applicable stage for the new deadline'
);
SELECT is(
  public.create_overdue_task_escalation_notifications(), 0,
  'the changed deadline stage also remains idempotent'
);

SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'overdue escalation creates no additional clock'
);
SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing private temporal command remains unchanged'
);

SELECT * FROM finish();
ROLLBACK;
