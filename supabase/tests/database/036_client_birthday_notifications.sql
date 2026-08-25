BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_client_birthday_notifications',
  ARRAY['timestamp with time zone'],
  'private client-birthday helper exists'
);
SELECT has_index(
  'public', 'clients', 'clients_active_birthday_idx',
  'active birthday lookup has a dedicated partial index'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_client_birthday_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_client_birthday_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_client_birthday_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_client_birthday_notifications(timestamp with time zone)',
    'EXECUTE'
  ),
  'only postgres can invoke the client-birthday helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('19900000-0000-0000-0000-000000000001', 'birthday-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000002', 'birthday-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000003', 'birthday-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000004', 'birthday-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000005', 'birthday-disabled@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000006', 'birthday-archived@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, archived_at) VALUES
  ('29900000-0000-0000-0000-000000000001', 'Birthday Tenant', NULL),
  ('29900000-0000-0000-0000-000000000002', 'Birthday Disabled Tenant', NULL),
  ('29900000-0000-0000-0000-000000000003', 'Birthday Archived Tenant', now());

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000002', 'administrador', true),
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000003', 'operacional', true),
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000004', 'operacional', true),
  ('29900000-0000-0000-0000-000000000002', '19900000-0000-0000-0000-000000000005', 'proprietario', true),
  ('29900000-0000-0000-0000-000000000003', '19900000-0000-0000-0000-000000000006', 'proprietario', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, notification_preferences
) VALUES
  ('29900000-0000-0000-0000-000000000001', 'America/Sao_Paulo', '{"client_birthdays": true}'::jsonb),
  ('29900000-0000-0000-0000-000000000002', 'America/Sao_Paulo', '{"client_birthdays": false}'::jsonb),
  ('29900000-0000-0000-0000-000000000003', 'America/Sao_Paulo', '{"client_birthdays": true}'::jsonb);

INSERT INTO public.clients(
  id, organization_id, person_type, name, status, owner_id, birth_date,
  created_by, archived_at
) VALUES
  ('39900000-0000-0000-0000-000000000001', '29900000-0000-0000-0000-000000000001', 'pf', 'Owned Birthday In Seven Days', 'ativo', '19900000-0000-0000-0000-000000000003', '1990-09-01', '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000002', '29900000-0000-0000-0000-000000000001', 'pf', 'Unassigned Birthday Today', 'ativo', NULL, '1992-08-25', '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000003', '29900000-0000-0000-0000-000000000001', 'pf', 'Inactive Owner Birthday Today', 'ativo', '19900000-0000-0000-0000-000000000004', '1988-08-25', '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000004', '29900000-0000-0000-0000-000000000001', 'pf', 'Birthday Tomorrow', 'ativo', '19900000-0000-0000-0000-000000000003', '1995-08-26', '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000005', '29900000-0000-0000-0000-000000000001', 'pf', 'Inactive Birthday', 'inativo', '19900000-0000-0000-0000-000000000003', '1991-08-25', '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000006', '29900000-0000-0000-0000-000000000001', 'pf', 'Archived Birthday', 'ativo', '19900000-0000-0000-0000-000000000003', '1991-08-25', '19900000-0000-0000-0000-000000000001', '2026-08-01 12:00:00+00'),
  ('39900000-0000-0000-0000-000000000007', '29900000-0000-0000-0000-000000000001', 'pj', 'Company Foundation Date', 'ativo', '19900000-0000-0000-0000-000000000003', '1991-08-25', '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000008', '29900000-0000-0000-0000-000000000001', 'pf', 'Missing Birthday', 'ativo', '19900000-0000-0000-0000-000000000003', NULL, '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000009', '29900000-0000-0000-0000-000000000002', 'pf', 'Disabled Birthday', 'ativo', '19900000-0000-0000-0000-000000000005', '1991-08-25', '19900000-0000-0000-0000-000000000005', NULL),
  ('39900000-0000-0000-0000-000000000010', '29900000-0000-0000-0000-000000000003', 'pf', 'Archived Tenant Birthday', 'ativo', '19900000-0000-0000-0000-000000000006', '1991-08-25', '19900000-0000-0000-0000-000000000006', NULL),
  ('39900000-0000-0000-0000-000000000011', '29900000-0000-0000-0000-000000000001', 'pf', 'Leap Day Birthday', 'ativo', '19900000-0000-0000-0000-000000000003', '2000-02-29', '19900000-0000-0000-0000-000000000001', NULL),
  ('39900000-0000-0000-0000-000000000012', '29900000-0000-0000-0000-000000000001', 'pf', 'New Year Birthday', 'ativo', '19900000-0000-0000-0000-000000000003', '1994-01-01', '19900000-0000-0000-0000-000000000001', NULL);

-- The assignment was valid when created; this tests the management fallback.
UPDATE public.organization_members
SET is_active = false
WHERE organization_id = '29900000-0000-0000-0000-000000000001'
  AND user_id = '19900000-0000-0000-0000-000000000004';

SELECT is(
  public.create_client_birthday_notifications('2026-08-25 10:59:00+00'),
  0,
  'the birthday scan does not run before 08:00 local time'
);
SELECT is(
  public.create_client_birthday_notifications('2026-08-25 12:00:00+00'),
  5,
  'due birthdays notify the active owner or active management fallback'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url = '/clientes/39900000-0000-0000-0000-000000000001'
      AND user_id = '19900000-0000-0000-0000-000000000003'
      AND title = 'Aniversário em 7 dias: Owned Birthday In Seven Days'
      AND dedupe_key LIKE 'client-birthday:%:2026:7:%'
  ),
  1::bigint,
  'the active operational owner receives the advance reminder'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url IN (
      '/clientes/39900000-0000-0000-0000-000000000002',
      '/clientes/39900000-0000-0000-0000-000000000003'
    )
      AND user_id IN (
        '19900000-0000-0000-0000-000000000001',
        '19900000-0000-0000-0000-000000000002'
      )
      AND title LIKE 'Aniversário hoje:%'
      AND dedupe_key LIKE 'client-birthday:%:2026:0:%'
  ),
  4::bigint,
  'unassigned or inactive ownership falls back to active management'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE action_url IN (
      '/clientes/39900000-0000-0000-0000-000000000004',
      '/clientes/39900000-0000-0000-0000-000000000005',
      '/clientes/39900000-0000-0000-0000-000000000006',
      '/clientes/39900000-0000-0000-0000-000000000007',
      '/clientes/39900000-0000-0000-0000-000000000008',
      '/clientes/39900000-0000-0000-0000-000000000009',
      '/clientes/39900000-0000-0000-0000-000000000010',
      '/clientes/39900000-0000-0000-0000-000000000012'
    )
      AND dedupe_key LIKE 'client-birthday:%'
  ),
  0::bigint,
  'non-due, inactive, archived, company, missing, disabled and archived-tenant clients are ignored'
);
SELECT is(
  public.create_client_birthday_notifications('2026-08-25 12:15:00+00'),
  0,
  'the same birthday stage is idempotent'
);
SELECT is(
  public.create_client_birthday_notifications('2027-08-25 12:00:00+00'),
  5,
  'the next civil year creates the approved reminders again'
);

SELECT is(
  public.create_client_birthday_notifications('2026-12-25 12:00:00+00'),
  1,
  'a January birthday is announced seven days earlier across the year boundary'
);
SELECT is(
  public.create_client_birthday_notifications('2027-01-01 12:00:00+00'),
  1,
  'a January birthday is announced on the day in the new civil year'
);

SELECT is(
  public.create_client_birthday_notifications('2027-02-21 12:00:00+00'),
  1,
  'a leap-day birthday is announced seven days before February 28 in a non-leap year'
);
SELECT is(
  public.create_client_birthday_notifications('2027-02-28 12:00:00+00'),
  1,
  'a leap-day birthday is announced on February 28 in a non-leap year'
);
SELECT is(
  public.create_client_birthday_notifications('2027-02-28 12:15:00+00'),
  0,
  'the adjusted leap-day birthday remains idempotent'
);
SELECT is(
  public.create_client_birthday_notifications('2028-02-29 12:00:00+00'),
  1,
  'a leap-day birthday uses February 29 in a leap year'
);

SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the birthday scan creates no additional clock'
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
  ) LIKE '%client_birthday_notifications_created%'
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
  'the temporal cycle preserves every prior stage and adds birthdays'
);

SELECT * FROM finish();
ROLLBACK;
