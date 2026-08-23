BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_function(
  'public', 'create_critical_monitoring_notifications', ARRAY[]::text[],
  'private critical-monitoring helper exists'
);
SELECT has_function(
  'public', 'run_temporal_automation_cycle', ARRAY[]::text[],
  'private temporal cycle exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_critical_monitoring_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.create_critical_monitoring_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.create_critical_monitoring_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.run_temporal_automation_cycle()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.run_temporal_automation_cycle()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.run_temporal_automation_cycle()', 'EXECUTE'
  ),
  'client and service roles cannot invoke either private function'
);
SELECT ok(
  has_function_privilege(
    'postgres', 'public.create_critical_monitoring_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.run_temporal_automation_cycle()', 'EXECUTE'
  ),
  'postgres can invoke the private temporal functions'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19260000-0000-0000-0000-000000000001', 'critical-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19260000-0000-0000-0000-000000000002', 'critical-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19260000-0000-0000-0000-000000000003', 'critical-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19260000-0000-0000-0000-000000000004', 'critical-other@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29260000-0000-0000-0000-000000000001', 'Critical Tenant'),
  ('29260000-0000-0000-0000-000000000002', 'Disabled Critical Tenant');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29260000-0000-0000-0000-000000000001', '19260000-0000-0000-0000-000000000001', 'administrador', true),
  ('29260000-0000-0000-0000-000000000001', '19260000-0000-0000-0000-000000000002', 'operacional', true),
  ('29260000-0000-0000-0000-000000000001', '19260000-0000-0000-0000-000000000003', 'administrador', false),
  ('29260000-0000-0000-0000-000000000002', '19260000-0000-0000-0000-000000000004', 'administrador', true);

INSERT INTO public.organization_settings(organization_id) VALUES
  ('29260000-0000-0000-0000-000000000001'),
  ('29260000-0000-0000-0000-000000000002');
UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'false'::jsonb, true
)
WHERE organization_id = '29260000-0000-0000-0000-000000000002';

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, due_at, assignee_id, created_by
) VALUES
  ('49260000-0000-0000-0000-000000000001', '29260000-0000-0000-0000-000000000001', 'Critical assigned task', 'pendente', 'media', now() - interval '8 days', '19260000-0000-0000-0000-000000000002', '19260000-0000-0000-0000-000000000001'),
  ('49260000-0000-0000-0000-000000000002', '29260000-0000-0000-0000-000000000001', 'Critical unassigned task', 'pendente', 'media', now() - interval '9 days', NULL, '19260000-0000-0000-0000-000000000001'),
  ('49260000-0000-0000-0000-000000000003', '29260000-0000-0000-0000-000000000001', 'High but not critical task', 'pendente', 'media', now() - interval '2 days', '19260000-0000-0000-0000-000000000002', '19260000-0000-0000-0000-000000000001'),
  ('49260000-0000-0000-0000-000000000004', '29260000-0000-0000-0000-000000000001', 'Resolved critical task', 'pendente', 'media', now() - interval '10 days', '19260000-0000-0000-0000-000000000002', '19260000-0000-0000-0000-000000000001'),
  ('49260000-0000-0000-0000-000000000005', '29260000-0000-0000-0000-000000000002', 'Disabled tenant critical task', 'pendente', 'media', now() - interval '11 days', '19260000-0000-0000-0000-000000000004', '19260000-0000-0000-0000-000000000004');

INSERT INTO public.monitoring_states(
  id, organization_id, source_type, source_id, alert_kind, monitoring_status
) VALUES
  ('59260000-0000-0000-0000-000000000001', '29260000-0000-0000-0000-000000000001', 'tarefa', '49260000-0000-0000-0000-000000000001', 'tarefa_atrasada', 'novo'),
  ('59260000-0000-0000-0000-000000000002', '29260000-0000-0000-0000-000000000001', 'tarefa', '49260000-0000-0000-0000-000000000004', 'tarefa_atrasada', 'resolvido');

SELECT is(
  public.create_critical_monitoring_notifications(), 2,
  'one assigned and one unassigned critical notification are created'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id = '19260000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'critical-monitoring:%'),
  1::bigint,
  'active responsible member receives the assigned critical alert'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id = '19260000-0000-0000-0000-000000000001'
     AND dedupe_key LIKE 'critical-monitoring:%'),
  1::bigint,
  'active administrator receives the unassigned critical alert'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE user_id IN (
     '19260000-0000-0000-0000-000000000003',
     '19260000-0000-0000-0000-000000000004'
   ) AND dedupe_key LIKE 'critical-monitoring:%'),
  0::bigint,
  'inactive and preference-disabled cross-tenant members receive nothing'
);
SELECT is(
  public.create_critical_monitoring_notifications(), 0,
  'replaying the same critical episode creates no duplicate'
);

UPDATE public.monitoring_states
SET monitoring_status = 'resolvido', updated_at = now()
WHERE id = '59260000-0000-0000-0000-000000000001';
SELECT is(
  public.create_critical_monitoring_notifications(), 0,
  'resolved critical alert remains silent'
);
UPDATE public.monitoring_states
SET monitoring_status = 'novo', resolved_at = NULL, updated_at = now()
WHERE id = '59260000-0000-0000-0000-000000000001';
INSERT INTO public.monitoring_state_history(
  organization_id, monitoring_state_id, action, details
) VALUES (
  '29260000-0000-0000-0000-000000000001',
  '59260000-0000-0000-0000-000000000001',
  'reaberto', '{"from":"resolvido","to":"novo"}'
);
SELECT is(
  public.create_critical_monitoring_notifications(), 1,
  'a reopened critical episode can notify its responsible member once again'
);
SELECT is(
  public.create_critical_monitoring_notifications(), 0,
  'replaying the reopened episode also creates no duplicate'
);

SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing single job invokes the private combined cycle'
);
SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'reconfiguration preserves exactly one temporal job'
);

SELECT * FROM finish();
ROLLBACK;
