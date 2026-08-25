BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_stale_lead_notifications',
  ARRAY['timestamp with time zone'],
  'private stale-lead helper exists'
);
SELECT has_index(
  'public', 'clients', 'clients_stale_lead_interaction_idx',
  'stale lead lookup has a dedicated partial index'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_stale_lead_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_stale_lead_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_stale_lead_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_stale_lead_notifications(timestamp with time zone)',
    'EXECUTE'
  ),
  'only postgres can invoke the stale-lead helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('49900000-0000-0000-0000-000000000001', 'lead-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49900000-0000-0000-0000-000000000002', 'lead-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49900000-0000-0000-0000-000000000003', 'lead-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49900000-0000-0000-0000-000000000004', 'lead-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49900000-0000-0000-0000-000000000005', 'lead-disabled@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('49900000-0000-0000-0000-000000000006', 'lead-archived@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, archived_at) VALUES
  ('59900000-0000-0000-0000-000000000001', 'Lead Tenant', NULL),
  ('59900000-0000-0000-0000-000000000002', 'Lead Disabled Tenant', NULL),
  ('59900000-0000-0000-0000-000000000003', 'Lead Archived Tenant', now());

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('59900000-0000-0000-0000-000000000001', '49900000-0000-0000-0000-000000000001', 'proprietario', true),
  ('59900000-0000-0000-0000-000000000001', '49900000-0000-0000-0000-000000000002', 'administrador', true),
  ('59900000-0000-0000-0000-000000000001', '49900000-0000-0000-0000-000000000003', 'operacional', true),
  ('59900000-0000-0000-0000-000000000001', '49900000-0000-0000-0000-000000000004', 'operacional', true),
  ('59900000-0000-0000-0000-000000000002', '49900000-0000-0000-0000-000000000005', 'proprietario', true),
  ('59900000-0000-0000-0000-000000000003', '49900000-0000-0000-0000-000000000006', 'proprietario', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, notification_preferences
) VALUES
  ('59900000-0000-0000-0000-000000000001', 'America/Sao_Paulo', '{"stale_leads": true}'::jsonb),
  ('59900000-0000-0000-0000-000000000002', 'America/Sao_Paulo', '{"stale_leads": false}'::jsonb),
  ('59900000-0000-0000-0000-000000000003', 'America/Sao_Paulo', '{"stale_leads": true}'::jsonb);

INSERT INTO public.clients(
  id, organization_id, person_type, name, status, owner_id,
  last_interaction_at, created_at, created_by, archived_at
) VALUES
  ('69900000-0000-0000-0000-000000000001', '59900000-0000-0000-0000-000000000001', 'pf', 'Owned Lead Three Days', 'lead', '49900000-0000-0000-0000-000000000003', NULL, '2026-08-22 12:00:00+00', '49900000-0000-0000-0000-000000000001', NULL),
  ('69900000-0000-0000-0000-000000000002', '59900000-0000-0000-0000-000000000001', 'pf', 'Owned Lead Seven Days', 'lead', '49900000-0000-0000-0000-000000000003', NULL, '2026-08-18 12:00:00+00', '49900000-0000-0000-0000-000000000001', NULL),
  ('69900000-0000-0000-0000-000000000003', '59900000-0000-0000-0000-000000000001', 'pf', 'Unassigned Lead Three Days', 'lead', NULL, NULL, '2026-08-22 12:00:00+00', '49900000-0000-0000-0000-000000000001', NULL),
  ('69900000-0000-0000-0000-000000000004', '59900000-0000-0000-0000-000000000001', 'pf', 'Inactive Owner Lead Seven Days', 'lead', '49900000-0000-0000-0000-000000000004', NULL, '2026-08-18 12:00:00+00', '49900000-0000-0000-0000-000000000001', NULL),
  ('69900000-0000-0000-0000-000000000005', '59900000-0000-0000-0000-000000000001', 'pf', 'Lead Two Days', 'lead', '49900000-0000-0000-0000-000000000003', NULL, '2026-08-23 12:00:00+00', '49900000-0000-0000-0000-000000000001', NULL),
  ('69900000-0000-0000-0000-000000000006', '59900000-0000-0000-0000-000000000001', 'pf', 'Active Client', 'ativo', '49900000-0000-0000-0000-000000000003', NULL, '2026-07-01 12:00:00+00', '49900000-0000-0000-0000-000000000001', NULL),
  ('69900000-0000-0000-0000-000000000007', '59900000-0000-0000-0000-000000000001', 'pf', 'Archived Lead', 'lead', '49900000-0000-0000-0000-000000000003', NULL, '2026-08-18 12:00:00+00', '49900000-0000-0000-0000-000000000001', '2026-08-20 12:00:00+00'),
  ('69900000-0000-0000-0000-000000000008', '59900000-0000-0000-0000-000000000001', 'pf', 'Recently Contacted Lead', 'lead', '49900000-0000-0000-0000-000000000003', '2026-08-23 12:00:00+00', '2026-08-01 12:00:00+00', '49900000-0000-0000-0000-000000000001', NULL),
  ('69900000-0000-0000-0000-000000000009', '59900000-0000-0000-0000-000000000002', 'pf', 'Disabled Lead', 'lead', '49900000-0000-0000-0000-000000000005', NULL, '2026-08-18 12:00:00+00', '49900000-0000-0000-0000-000000000005', NULL),
  ('69900000-0000-0000-0000-000000000010', '59900000-0000-0000-0000-000000000003', 'pf', 'Archived Tenant Lead', 'lead', '49900000-0000-0000-0000-000000000006', NULL, '2026-08-18 12:00:00+00', '49900000-0000-0000-0000-000000000006', NULL);

UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '59900000-0000-0000-0000-000000000001'
  AND user_id = '49900000-0000-0000-0000-000000000004';

SELECT is(
  public.create_stale_lead_notifications('2026-08-25 10:59:00+00'),
  0,
  'the stale-lead scan does not run before 08:00 local time'
);
SELECT is(
  public.create_stale_lead_notifications('2026-08-25 12:00:00+00'),
  8,
  'three- and seven-day leads notify the approved recipients'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url = '/clientes/69900000-0000-0000-0000-000000000001'
      AND user_id = '49900000-0000-0000-0000-000000000003'
      AND title = 'Lead sem retorno há 3 dias: Owned Lead Three Days'
      AND dedupe_key LIKE 'stale-lead:%:3:%'
  ),
  1::bigint,
  'the active owner receives the three-day reminder'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url = '/clientes/69900000-0000-0000-0000-000000000002'
      AND user_id IN (
        '49900000-0000-0000-0000-000000000001',
        '49900000-0000-0000-0000-000000000002',
        '49900000-0000-0000-0000-000000000003'
      )
      AND title = 'Lead sem retorno há 7 dias: Owned Lead Seven Days'
      AND dedupe_key LIKE 'stale-lead:%:7:%'
  ),
  3::bigint,
  'the seven-day reminder reaches the owner and active management'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url IN (
      '/clientes/69900000-0000-0000-0000-000000000003',
      '/clientes/69900000-0000-0000-0000-000000000004'
    )
      AND user_id IN (
        '49900000-0000-0000-0000-000000000001',
        '49900000-0000-0000-0000-000000000002'
      )
  ),
  4::bigint,
  'missing or inactive ownership falls back to active management'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url IN (
      '/clientes/69900000-0000-0000-0000-000000000005',
      '/clientes/69900000-0000-0000-0000-000000000006',
      '/clientes/69900000-0000-0000-0000-000000000007',
      '/clientes/69900000-0000-0000-0000-000000000008',
      '/clientes/69900000-0000-0000-0000-000000000009',
      '/clientes/69900000-0000-0000-0000-000000000010'
    )
      AND dedupe_key LIKE 'stale-lead:%'
  ),
  0::bigint,
  'recent, active, archived, disabled and archived-tenant rows are ignored'
);
SELECT is(
  public.create_stale_lead_notifications('2026-08-25 12:15:00+00'),
  0,
  'the same lead episode and stage are idempotent'
);

UPDATE public.clients
SET last_interaction_at = '2026-08-22 13:00:00+00'
WHERE id = '69900000-0000-0000-0000-000000000001';

SELECT is(
  public.create_stale_lead_notifications('2026-08-25 12:30:00+00'),
  1,
  'a confirmed-contact timestamp starts a new deduplicated episode'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the stale-lead scan creates no additional clock'
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
  ) LIKE '%stale_lead_notifications_created%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_stale_lead_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_client_birthday_notifications()%'
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
  'the temporal cycle preserves every prior stage and adds stale leads'
);

SELECT * FROM finish();
ROLLBACK;
