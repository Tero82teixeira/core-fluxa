BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_function(
  'public', 'create_deadline_reminder_notifications', ARRAY[]::text[],
  'private deadline-reminder helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_deadline_reminder_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.create_deadline_reminder_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.create_deadline_reminder_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.create_deadline_reminder_notifications()', 'EXECUTE'
  ),
  'only postgres can invoke the deadline-reminder helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19280000-0000-0000-0000-000000000001', 'deadline-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19280000-0000-0000-0000-000000000002', 'deadline-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19280000-0000-0000-0000-000000000003', 'deadline-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19280000-0000-0000-0000-000000000004', 'deadline-other@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29280000-0000-0000-0000-000000000001', 'Deadline Tenant'),
  ('29280000-0000-0000-0000-000000000002', 'Disabled Deadline Tenant');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29280000-0000-0000-0000-000000000001', '19280000-0000-0000-0000-000000000001', 'administrador', true),
  ('29280000-0000-0000-0000-000000000001', '19280000-0000-0000-0000-000000000002', 'operacional', true),
  ('29280000-0000-0000-0000-000000000001', '19280000-0000-0000-0000-000000000003', 'administrador', true),
  ('29280000-0000-0000-0000-000000000002', '19280000-0000-0000-0000-000000000004', 'administrador', true);

INSERT INTO public.organization_settings(organization_id, timezone) VALUES
  ('29280000-0000-0000-0000-000000000001', 'UTC'),
  ('29280000-0000-0000-0000-000000000002', 'UTC');
UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{deadline_reminders}', 'false'::jsonb, true
)
WHERE organization_id = '29280000-0000-0000-0000-000000000002';

INSERT INTO public.clients(id, organization_id, name, created_by) VALUES
  ('39280000-0000-0000-0000-000000000001', '29280000-0000-0000-0000-000000000001', 'Deadline Client', '19280000-0000-0000-0000-000000000001');
INSERT INTO public.processes(
  id, organization_id, code, client_id, title, due_date, owner_id, created_by
) VALUES (
  '49280000-0000-0000-0000-000000000001',
  '29280000-0000-0000-0000-000000000001',
  'PRAZO-001', '39280000-0000-0000-0000-000000000001',
  'Process deadline', current_date + 15,
  '19280000-0000-0000-0000-000000000002',
  '19280000-0000-0000-0000-000000000001'
);
INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id, created_by
) VALUES
  ('59280000-0000-0000-0000-000000000001', '29280000-0000-0000-0000-000000000001', 'Task in 30 days', 'pendente', 'media', (current_date + 30)::timestamptz + interval '12 hours', '19280000-0000-0000-0000-000000000002', '19280000-0000-0000-0000-000000000001'),
  ('59280000-0000-0000-0000-000000000002', '29280000-0000-0000-0000-000000000001', 'Task in 15 days unassigned', 'pendente', 'media', (current_date + 15)::timestamptz + interval '12 hours', NULL, '19280000-0000-0000-0000-000000000001'),
  ('59280000-0000-0000-0000-000000000003', '29280000-0000-0000-0000-000000000001', 'Task in 1 day inactive assignee', 'pendente', 'media', (current_date + 1)::timestamptz + interval '12 hours', '19280000-0000-0000-0000-000000000003', '19280000-0000-0000-0000-000000000001'),
  ('59280000-0000-0000-0000-000000000004', '29280000-0000-0000-0000-000000000001', 'Completed task in 7 days', 'concluida', 'media', (current_date + 7)::timestamptz + interval '12 hours', '19280000-0000-0000-0000-000000000002', '19280000-0000-0000-0000-000000000001'),
  ('59280000-0000-0000-0000-000000000005', '29280000-0000-0000-0000-000000000002', 'Disabled tenant task', 'pendente', 'media', (current_date + 30)::timestamptz + interval '12 hours', '19280000-0000-0000-0000-000000000004', '19280000-0000-0000-0000-000000000004');

-- The assignment was valid when created; the member later became inactive.
UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '29280000-0000-0000-0000-000000000001'
  AND user_id = '19280000-0000-0000-0000-000000000003';

INSERT INTO public.documents(
  id, organization_id, title, expiration_date, file_path,
  original_file_name, stored_file_name, file_extension, mime_type,
  file_size, uploaded_by
) VALUES (
  '69280000-0000-0000-0000-000000000001',
  '29280000-0000-0000-0000-000000000001',
  'Document in 7 days', current_date + 7, 'deadline/test.pdf',
  'test.pdf', 'test.pdf', 'pdf', 'application/pdf', 10,
  '19280000-0000-0000-0000-000000000001'
);
INSERT INTO public.financial_transactions(
  id, organization_id, type, description, amount, status, due_date,
  responsible_user_id, created_by
) VALUES (
  '79280000-0000-0000-0000-000000000001',
  '29280000-0000-0000-0000-000000000001',
  'expense', 'Financial deadline tomorrow', 100, 'pending', current_date + 1,
  '19280000-0000-0000-0000-000000000002',
  '19280000-0000-0000-0000-000000000001'
);

SELECT is(
  public.create_deadline_reminder_notifications(), 6,
  'deadline ladder creates the six eligible recipient notifications'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id = '19280000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'deadline-reminder:%'),
  2::bigint,
  'active responsible receives task and process reminders'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id = '19280000-0000-0000-0000-000000000001'
     AND dedupe_key LIKE 'deadline-reminder:%'),
  4::bigint,
  'administrator receives unassigned, inactive, document and finance fallbacks'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id IN (
     '19280000-0000-0000-0000-000000000003',
     '19280000-0000-0000-0000-000000000004'
   ) AND dedupe_key LIKE 'deadline-reminder:%'),
  0::bigint,
  'inactive and preference-disabled cross-tenant members receive nothing'
);
SELECT is(
  public.create_deadline_reminder_notifications(), 0,
  'replaying the same deadline ladder creates no duplicate'
);

UPDATE public.tasks
SET due_at = (current_date + 15)::timestamptz + interval '12 hours'
WHERE id = '59280000-0000-0000-0000-000000000001';
SELECT is(
  public.create_deadline_reminder_notifications(), 1,
  'changing a due date permits one reminder for the new deadline'
);
SELECT is(
  public.create_deadline_reminder_notifications(), 0,
  'the changed deadline also remains idempotent'
);

SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'deadline reminders create no additional clock'
);
SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing private temporal command remains unchanged'
);

SELECT * FROM finish();
ROLLBACK;
