BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SELECT no_plan();

SELECT has_function(
  'public', 'create_overdue_communication_notifications', ARRAY[]::text[],
  'private overdue-communication helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_overdue_communication_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_overdue_communication_notifications()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_overdue_communication_notifications()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_overdue_communication_notifications()', 'EXECUTE'
  ),
  'only postgres can invoke the overdue-communication helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19310000-0000-0000-0000-000000000001', 'followup-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19310000-0000-0000-0000-000000000002', 'followup-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19310000-0000-0000-0000-000000000003', 'followup-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19310000-0000-0000-0000-000000000004', 'followup-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19310000-0000-0000-0000-000000000005', 'followup-disabled@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19310000-0000-0000-0000-000000000006', 'followup-hidden@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations(id, legal_name) VALUES
  ('29310000-0000-0000-0000-000000000001', 'Overdue Communication Tenant'),
  ('29310000-0000-0000-0000-000000000002', 'Disabled Communication Tenant'),
  ('29310000-0000-0000-0000-000000000003', 'Hidden Communication Tenant');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  ('29310000-0000-0000-0000-000000000001', '19310000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29310000-0000-0000-0000-000000000001', '19310000-0000-0000-0000-000000000002', 'administrador', true),
  ('29310000-0000-0000-0000-000000000001', '19310000-0000-0000-0000-000000000003', 'operacional', true),
  ('29310000-0000-0000-0000-000000000001', '19310000-0000-0000-0000-000000000004', 'operacional', true),
  ('29310000-0000-0000-0000-000000000002', '19310000-0000-0000-0000-000000000005', 'operacional', true),
  ('29310000-0000-0000-0000-000000000003', '19310000-0000-0000-0000-000000000006', 'operacional', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, monitoring_show_communication
) VALUES
  ('29310000-0000-0000-0000-000000000001', 'America/Sao_Paulo', true),
  ('29310000-0000-0000-0000-000000000002', 'America/Sao_Paulo', true),
  ('29310000-0000-0000-0000-000000000003', 'America/Sao_Paulo', false);
UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{overdue_communications}', 'false'::jsonb, true
)
WHERE organization_id = '29310000-0000-0000-0000-000000000002';

INSERT INTO public.clients(id, organization_id, name, created_by) VALUES
  ('39310000-0000-0000-0000-000000000001', '29310000-0000-0000-0000-000000000001', 'Follow-up Client', '19310000-0000-0000-0000-000000000001'),
  ('39310000-0000-0000-0000-000000000002', '29310000-0000-0000-0000-000000000002', 'Disabled Follow-up Client', '19310000-0000-0000-0000-000000000005'),
  ('39310000-0000-0000-0000-000000000003', '29310000-0000-0000-0000-000000000003', 'Hidden Follow-up Client', '19310000-0000-0000-0000-000000000006');

INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, status, priority, assigned_to,
  follow_up_at, created_by, archived_at
) VALUES
  ('49310000-0000-0000-0000-000000000001', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'First overdue follow-up', 'aberta', 'normal', '19310000-0000-0000-0000-000000000003', (current_date - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000002', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Escalated overdue follow-up', 'aguardando_cliente', 'normal', '19310000-0000-0000-0000-000000000003', (current_date - 3)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000003', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Urgent overdue follow-up', 'aberta', 'urgente', '19310000-0000-0000-0000-000000000003', (current_date - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000004', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Resolved monitoring follow-up', 'aberta', 'normal', '19310000-0000-0000-0000-000000000003', (current_date - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000005', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Unassigned overdue follow-up', 'aberta', 'normal', NULL, (current_date - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000006', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Inactive owner follow-up', 'aberta', 'normal', '19310000-0000-0000-0000-000000000004', (current_date - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000007', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Archived overdue follow-up', 'arquivada', 'normal', '19310000-0000-0000-0000-000000000003', (current_date - 3)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', now()),
  ('49310000-0000-0000-0000-000000000008', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Resolved overdue follow-up', 'resolvida', 'normal', '19310000-0000-0000-0000-000000000003', (current_date - 3)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000009', '29310000-0000-0000-0000-000000000002', '39310000-0000-0000-0000-000000000002', 'Preference disabled follow-up', 'aberta', 'normal', '19310000-0000-0000-0000-000000000005', (current_date - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000005', NULL),
  ('49310000-0000-0000-0000-000000000010', '29310000-0000-0000-0000-000000000001', '39310000-0000-0000-0000-000000000001', 'Owner is responsible follow-up', 'aguardando_equipe', 'normal', '19310000-0000-0000-0000-000000000001', (current_date - 3)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000001', NULL),
  ('49310000-0000-0000-0000-000000000011', '29310000-0000-0000-0000-000000000003', '39310000-0000-0000-0000-000000000003', 'Hidden monitoring follow-up', 'aberta', 'normal', '19310000-0000-0000-0000-000000000006', (current_date - 1)::timestamp AT TIME ZONE 'America/Sao_Paulo', '19310000-0000-0000-0000-000000000006', NULL);

INSERT INTO public.monitoring_states(
  id, organization_id, source_type, source_id, alert_kind,
  monitoring_status, assigned_to
) VALUES
  ('59310000-0000-0000-0000-000000000001', '29310000-0000-0000-0000-000000000001', 'comunicacao', '49310000-0000-0000-0000-000000000001', 'retorno_atrasado', 'novo', '19310000-0000-0000-0000-000000000002'),
  ('59310000-0000-0000-0000-000000000002', '29310000-0000-0000-0000-000000000001', 'comunicacao', '49310000-0000-0000-0000-000000000004', 'retorno_atrasado', 'resolvido', NULL);

-- The assignment was valid when created; the member later became inactive.
UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '29310000-0000-0000-0000-000000000001'
  AND user_id = '19310000-0000-0000-0000-000000000004';

SELECT is(
  public.create_overdue_communication_notifications(), 6,
  'the first and escalated stages create exactly six recipient notifications'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49310000-0000-0000-0000-000000000001'
     AND user_id = '19310000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'overdue-communication:%'),
  1::bigint,
  'an active monitoring assignee takes precedence over the thread owner'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49310000-0000-0000-0000-000000000002'
     AND dedupe_key LIKE 'overdue-communication:%'),
  3::bigint,
  'on the third day the responsible and active management are notified'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id = '49310000-0000-0000-0000-000000000010'
     AND dedupe_key LIKE 'overdue-communication:%'),
  2::bigint,
  'a manager who is also responsible receives an escalated notice only once'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
   WHERE entity_id IN (
     '49310000-0000-0000-0000-000000000003',
     '49310000-0000-0000-0000-000000000004',
     '49310000-0000-0000-0000-000000000005',
     '49310000-0000-0000-0000-000000000006',
     '49310000-0000-0000-0000-000000000007',
     '49310000-0000-0000-0000-000000000008',
     '49310000-0000-0000-0000-000000000009',
     '49310000-0000-0000-0000-000000000011'
   ) AND dedupe_key LIKE 'overdue-communication:%'),
  0::bigint,
  'critical, resolved, unassigned, inactive, closed, disabled and hidden items are excluded'
);
SELECT is(
  public.create_overdue_communication_notifications(), 0,
  'replaying the same follow-up episode creates no duplicate'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'false'::jsonb, true
)
WHERE organization_id = '29310000-0000-0000-0000-000000000001';
SELECT is(
  public.create_overdue_communication_notifications(), 1,
  'an urgent follow-up still gets its overdue notice when critical alerts are disabled'
);
SELECT is(
  public.create_overdue_communication_notifications(), 0,
  'the critical-preference fallback is also idempotent'
);

UPDATE public.organization_settings
SET notification_preferences = jsonb_set(
  coalesce(notification_preferences, '{}'::jsonb),
  '{critical_monitoring}', 'true'::jsonb, true
)
WHERE organization_id = '29310000-0000-0000-0000-000000000001';
UPDATE public.communication_threads
SET follow_up_at =
  (current_date - 3)::timestamp AT TIME ZONE 'America/Sao_Paulo'
WHERE id = '49310000-0000-0000-0000-000000000001';
SELECT is(
  public.create_overdue_communication_notifications(), 2,
  'a changed follow-up date can start a new escalated episode'
);
SELECT is(
  public.create_overdue_communication_notifications(), 0,
  'the changed follow-up episode remains idempotent on replay'
);

SELECT is(
  (SELECT status::text FROM public.communication_threads
   WHERE id = '49310000-0000-0000-0000-000000000002'),
  'aguardando_cliente',
  'the scan never changes the communication status'
);
SELECT is(
  (SELECT count(*) FROM public.tasks
   WHERE organization_id = '29310000-0000-0000-0000-000000000001'),
  0::bigint,
  'the scan never creates a task'
);
SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'overdue communication notices create no additional clock'
);
SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'the existing private temporal command remains unchanged'
);

SELECT * FROM finish();
ROLLBACK;
