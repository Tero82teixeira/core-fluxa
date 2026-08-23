BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_function(
  'public', 'create_unassigned_monitoring_notifications', ARRAY[]::text[],
  'private unassigned-monitoring helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_unassigned_monitoring_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.create_unassigned_monitoring_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.create_unassigned_monitoring_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.create_unassigned_monitoring_notifications()', 'EXECUTE'
  ),
  'only postgres can invoke the unassigned-monitoring helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19270000-0000-0000-0000-000000000001', 'unassigned-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19270000-0000-0000-0000-000000000002', 'unassigned-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19270000-0000-0000-0000-000000000003', 'unassigned-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19270000-0000-0000-0000-000000000004', 'unassigned-other@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29270000-0000-0000-0000-000000000001', 'Unassigned Tenant'),
  ('29270000-0000-0000-0000-000000000002', 'Disabled Unassigned Tenant');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29270000-0000-0000-0000-000000000001', '19270000-0000-0000-0000-000000000001', 'administrador', true),
  ('29270000-0000-0000-0000-000000000001', '19270000-0000-0000-0000-000000000002', 'operacional', true),
  ('29270000-0000-0000-0000-000000000001', '19270000-0000-0000-0000-000000000003', 'administrador', false),
  ('29270000-0000-0000-0000-000000000002', '19270000-0000-0000-0000-000000000004', 'administrador', true);

INSERT INTO public.organization_settings(organization_id) VALUES
  ('29270000-0000-0000-0000-000000000001'),
  ('29270000-0000-0000-0000-000000000002');
UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{unassigned_monitoring}', 'false'::jsonb, true
)
WHERE organization_id = '29270000-0000-0000-0000-000000000002';

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id, created_by
) VALUES
  ('49270000-0000-0000-0000-000000000001', '29270000-0000-0000-0000-000000000001', 'Unassigned overdue task', 'pendente', 'media', now() - interval '2 days', NULL, '19270000-0000-0000-0000-000000000001'),
  ('49270000-0000-0000-0000-000000000002', '29270000-0000-0000-0000-000000000001', 'Assigned overdue task', 'pendente', 'media', now() - interval '3 days', '19270000-0000-0000-0000-000000000002', '19270000-0000-0000-0000-000000000001'),
  ('49270000-0000-0000-0000-000000000003', '29270000-0000-0000-0000-000000000001', 'Resolved unassigned task', 'pendente', 'media', now() - interval '4 days', NULL, '19270000-0000-0000-0000-000000000001'),
  ('49270000-0000-0000-0000-000000000004', '29270000-0000-0000-0000-000000000002', 'Disabled tenant task', 'pendente', 'media', now() - interval '5 days', NULL, '19270000-0000-0000-0000-000000000004');

INSERT INTO public.monitoring_states(
  id, organization_id, source_type, source_id, alert_kind, monitoring_status
) VALUES
  ('59270000-0000-0000-0000-000000000001', '29270000-0000-0000-0000-000000000001', 'tarefa', '49270000-0000-0000-0000-000000000001', 'tarefa_atrasada', 'novo'),
  ('59270000-0000-0000-0000-000000000002', '29270000-0000-0000-0000-000000000001', 'tarefa', '49270000-0000-0000-0000-000000000003', 'tarefa_atrasada', 'resolvido');

SELECT is(
  public.create_unassigned_monitoring_notifications(), 1,
  'one active administrator receives the eligible unassigned alert'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id = '19270000-0000-0000-0000-000000000001'
     AND dedupe_key LIKE 'unassigned-monitoring:%'),
  1::bigint,
  'active administrator receives the unassigned notification'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id IN (
     '19270000-0000-0000-0000-000000000002',
     '19270000-0000-0000-0000-000000000003',
     '19270000-0000-0000-0000-000000000004'
   ) AND dedupe_key LIKE 'unassigned-monitoring:%'),
  0::bigint,
  'operators, inactive admins and disabled cross-tenant admins receive nothing'
);
SELECT is(
  public.create_unassigned_monitoring_notifications(), 0,
  'replaying the same unassigned episode creates no duplicate'
);

UPDATE public.monitoring_states
SET assigned_to = '19270000-0000-0000-0000-000000000002', updated_at = now()
WHERE id = '59270000-0000-0000-0000-000000000001';
SELECT is(
  public.create_unassigned_monitoring_notifications(), 0,
  'an active monitoring assignee suppresses the unassigned alert'
);
UPDATE public.monitoring_states
SET assigned_to = NULL, updated_at = now()
WHERE id = '59270000-0000-0000-0000-000000000001';
INSERT INTO public.monitoring_state_history(
  organization_id, monitoring_state_id, action, details
) VALUES (
  '29270000-0000-0000-0000-000000000001',
  '59270000-0000-0000-0000-000000000001',
  'responsavel_alterado', '{"assigned_to":null}'
);
SELECT is(
  public.create_unassigned_monitoring_notifications(), 1,
  'explicitly removing an assignee starts one new unassigned episode'
);
SELECT is(
  public.create_unassigned_monitoring_notifications(), 0,
  'the new unassigned episode also remains idempotent'
);

SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing temporal job command remains unchanged'
);
SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'the unassigned feature creates no additional clock'
);

SELECT * FROM finish();
ROLLBACK;
