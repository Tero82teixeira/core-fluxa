BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_weekly_data_quality_notifications',
  ARRAY['timestamp with time zone'],
  'private weekly data-quality helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_weekly_data_quality_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_weekly_data_quality_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_weekly_data_quality_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_weekly_data_quality_notifications(timestamp with time zone)',
    'EXECUTE'
  ),
  'only postgres can invoke the weekly data-quality helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('19700000-0000-0000-0000-000000000001', 'quality-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000002', 'quality-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000003', 'quality-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000004', 'quality-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000005', 'quality-clean@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000006', 'quality-archived@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, archived_at) VALUES
  ('29700000-0000-0000-0000-000000000001', 'Quality Issue Tenant', NULL),
  ('29700000-0000-0000-0000-000000000002', 'Quality Clean Tenant', NULL),
  ('29700000-0000-0000-0000-000000000003', 'Quality Archived Tenant', now());

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000002', 'administrador', true),
  ('29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000003', 'operacional', true),
  ('29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000004', 'administrador', false),
  ('29700000-0000-0000-0000-000000000002', '19700000-0000-0000-0000-000000000005', 'proprietario', true),
  ('29700000-0000-0000-0000-000000000003', '19700000-0000-0000-0000-000000000006', 'proprietario', true);

INSERT INTO public.organization_settings(organization_id, timezone) VALUES
  ('29700000-0000-0000-0000-000000000001', 'America/Sao_Paulo'),
  ('29700000-0000-0000-0000-000000000002', 'America/Sao_Paulo'),
  ('29700000-0000-0000-0000-000000000003', 'America/Sao_Paulo');

INSERT INTO public.tasks(
  id, organization_id, title, status, completed_at, completed_by,
  created_by, updated_by, archived_at, deleted_at
) VALUES
  (
    '79700000-0000-0000-0000-000000000001',
    '29700000-0000-0000-0000-000000000001',
    'Missing completion actor', 'concluida',
    '2026-08-24 12:00:00+00', NULL,
    '19700000-0000-0000-0000-000000000001',
    '19700000-0000-0000-0000-000000000001', NULL, NULL
  ),
  (
    '79700000-0000-0000-0000-000000000002',
    '29700000-0000-0000-0000-000000000002',
    'Complete metadata', 'concluida',
    '2026-08-24 12:00:00+00',
    '19700000-0000-0000-0000-000000000005',
    '19700000-0000-0000-0000-000000000005',
    '19700000-0000-0000-0000-000000000005', NULL, NULL
  ),
  (
    '79700000-0000-0000-0000-000000000003',
    '29700000-0000-0000-0000-000000000003',
    'Archived tenant inconsistency', 'concluida',
    '2026-08-24 12:00:00+00', NULL,
    '19700000-0000-0000-0000-000000000006',
    '19700000-0000-0000-0000-000000000006', NULL, NULL
  );

SELECT is(
  public.create_weekly_data_quality_notifications(
    '2026-08-24 12:00:00+00'
  ),
  0,
  'the data-quality scan does not run on Monday'
);
SELECT is(
  public.create_weekly_data_quality_notifications(
    '2026-08-25 10:59:00+00'
  ),
  0,
  'the data-quality scan does not run before 08:00 local time'
);
SELECT is(
  public.create_weekly_data_quality_notifications(
    '2026-08-25 12:00:00+00'
  ),
  2,
  'Tuesday creates one notification for each active authorized manager'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29700000-0000-0000-0000-000000000001'
      AND title = 'Qualidade dos dados: revisão necessária'
      AND kind = 'monitoring'
      AND action_url = '/relatorios'
      AND body LIKE '%1 inconsistência%'
      AND body LIKE '%tarefas 1%'
      AND body LIKE '%Nenhum cadastro foi alterado automaticamente%'
  ),
  2::bigint,
  'the summary reports the proven task inconsistency to management'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29700000-0000-0000-0000-000000000001'
      AND user_id IN (
        '19700000-0000-0000-0000-000000000003',
        '19700000-0000-0000-0000-000000000004'
      )
      AND dedupe_key LIKE 'weekly-data-quality:%'
  ),
  0::bigint,
  'operator and inactive manager receive no data-quality notification'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id IN (
      '29700000-0000-0000-0000-000000000002',
      '29700000-0000-0000-0000-000000000003'
    )
      AND dedupe_key LIKE 'weekly-data-quality:%'
  ),
  0::bigint,
  'clean and archived organizations receive no notification'
);
SELECT is(
  public.create_weekly_data_quality_notifications(
    '2026-08-25 12:15:00+00'
  ),
  0,
  'replaying the same week does not duplicate a recipient notification'
);
SELECT is(
  public.create_weekly_data_quality_notifications(
    '2026-09-01 12:00:00+00'
  ),
  2,
  'an unresolved inconsistency is reported once again in a new week'
);
SELECT is(
  (
    SELECT completed_by
    FROM public.tasks
    WHERE id = '79700000-0000-0000-0000-000000000001'
  ),
  NULL::uuid,
  'the scan never repairs a task automatically'
);
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the data-quality scan creates no additional clock'
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
  ) LIKE '%weekly_data_quality_notifications_created%'
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
  'the temporal cycle preserves every prior stage and adds data quality'
);

SELECT * FROM finish();
ROLLBACK;
