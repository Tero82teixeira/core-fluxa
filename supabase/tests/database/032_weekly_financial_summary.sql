BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'create_weekly_financial_summary_notifications',
  ARRAY['timestamp with time zone'],
  'private weekly financial summary helper exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_weekly_financial_summary_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_weekly_financial_summary_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.create_weekly_financial_summary_notifications(timestamp with time zone)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.create_weekly_financial_summary_notifications(timestamp with time zone)',
    'EXECUTE'
  ),
  'only postgres can invoke the weekly financial summary helper'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('19600000-0000-0000-0000-000000000001', 'weekly-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000002', 'weekly-admin@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000003', 'weekly-manager@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000004', 'weekly-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000005', 'weekly-inactive@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000006', 'weekly-disabled@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000007', 'weekly-archived@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000008', 'weekly-fallback@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, archived_at) VALUES
  (
    '29600000-0000-0000-0000-000000000001',
    'Weekly Finance Tenant', NULL
  ),
  (
    '29600000-0000-0000-0000-000000000002',
    'Disabled Weekly Finance Tenant', NULL
  ),
  (
    '29600000-0000-0000-0000-000000000003',
    'Archived Weekly Finance Tenant', now()
  ),
  (
    '29600000-0000-0000-0000-000000000004',
    'Fallback Weekly Finance Tenant', NULL
  );

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000002', 'administrador', true),
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000003', 'gestor', true),
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000004', 'operacional', true),
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000005', 'administrador', false),
  ('29600000-0000-0000-0000-000000000002', '19600000-0000-0000-0000-000000000006', 'proprietario', true),
  ('29600000-0000-0000-0000-000000000003', '19600000-0000-0000-0000-000000000007', 'proprietario', true),
  ('29600000-0000-0000-0000-000000000004', '19600000-0000-0000-0000-000000000008', 'proprietario', true);

INSERT INTO public.organization_settings(
  organization_id, timezone, monitoring_show_financial
) VALUES
  (
    '29600000-0000-0000-0000-000000000001',
    'America/Sao_Paulo', true
  ),
  (
    '29600000-0000-0000-0000-000000000002',
    'America/Sao_Paulo', false
  );

INSERT INTO public.financial_accounts(
  id, organization_id, name, type, current_balance, is_active,
  created_by, archived_at
) VALUES
  (
    '39600000-0000-0000-0000-000000000001',
    '29600000-0000-0000-0000-000000000001',
    'Weekly bank account', 'bank', 1000, true,
    '19600000-0000-0000-0000-000000000001', NULL
  ),
  (
    '39600000-0000-0000-0000-000000000002',
    '29600000-0000-0000-0000-000000000001',
    'Weekly cash account', 'cash', 500, true,
    '19600000-0000-0000-0000-000000000001', NULL
  ),
  (
    '39600000-0000-0000-0000-000000000003',
    '29600000-0000-0000-0000-000000000001',
    'Archived weekly account', 'bank', 900, false,
    '19600000-0000-0000-0000-000000000001', now()
  );

INSERT INTO public.financial_transactions(
  id, organization_id, type, description, amount, status, due_date,
  created_by, archived_at
) VALUES
  ('79600000-0000-0000-0000-000000000001', '29600000-0000-0000-0000-000000000001', 'income', 'Overdue receivable', 1000, 'pending', '2026-08-20', '19600000-0000-0000-0000-000000000001', NULL),
  ('79600000-0000-0000-0000-000000000002', '29600000-0000-0000-0000-000000000001', 'expense', 'Upcoming payable', 400, 'pending', '2026-08-27', '19600000-0000-0000-0000-000000000001', NULL),
  ('79600000-0000-0000-0000-000000000003', '29600000-0000-0000-0000-000000000001', 'income', 'Upcoming receivable', 300, 'pending', '2026-08-29', '19600000-0000-0000-0000-000000000001', NULL),
  ('79600000-0000-0000-0000-000000000004', '29600000-0000-0000-0000-000000000001', 'expense', 'Partial overdue payable', 200, 'partial', '2026-08-18', '19600000-0000-0000-0000-000000000001', NULL),
  ('79600000-0000-0000-0000-000000000005', '29600000-0000-0000-0000-000000000001', 'income', 'Received last week', 700, 'paid', '2026-08-20', '19600000-0000-0000-0000-000000000001', NULL),
  ('79600000-0000-0000-0000-000000000006', '29600000-0000-0000-0000-000000000001', 'expense', 'Archived open payable', 900, 'pending', '2026-08-20', '19600000-0000-0000-0000-000000000001', now()),
  ('79600000-0000-0000-0000-000000000007', '29600000-0000-0000-0000-000000000001', 'income', 'Cancelled receivable', 900, 'cancelled', '2026-08-20', '19600000-0000-0000-0000-000000000001', NULL),
  ('79600000-0000-0000-0000-000000000008', '29600000-0000-0000-0000-000000000001', 'income', 'Reversed receipt', 500, 'paid', '2026-08-20', '19600000-0000-0000-0000-000000000001', NULL),
  ('79600000-0000-0000-0000-000000000009', '29600000-0000-0000-0000-000000000002', 'income', 'Disabled tenant receivable', 100, 'pending', '2026-08-20', '19600000-0000-0000-0000-000000000006', NULL),
  ('79600000-0000-0000-0000-000000000010', '29600000-0000-0000-0000-000000000003', 'income', 'Archived tenant receivable', 100, 'pending', '2026-08-20', '19600000-0000-0000-0000-000000000007', NULL);

INSERT INTO public.financial_transaction_payments(
  id, organization_id, transaction_id, amount, paid_at, account_id,
  reversed_at, created_by
) VALUES
  (
    '89600000-0000-0000-0000-000000000001',
    '29600000-0000-0000-0000-000000000001',
    '79600000-0000-0000-0000-000000000004', 50,
    '2026-08-20 15:00:00+00',
    '39600000-0000-0000-0000-000000000001', NULL,
    '19600000-0000-0000-0000-000000000001'
  ),
  (
    '89600000-0000-0000-0000-000000000002',
    '29600000-0000-0000-0000-000000000001',
    '79600000-0000-0000-0000-000000000005', 700,
    '2026-08-20 15:00:00+00',
    '39600000-0000-0000-0000-000000000001', NULL,
    '19600000-0000-0000-0000-000000000001'
  ),
  (
    '89600000-0000-0000-0000-000000000003',
    '29600000-0000-0000-0000-000000000001',
    '79600000-0000-0000-0000-000000000008', 500,
    '2026-08-20 15:00:00+00',
    '39600000-0000-0000-0000-000000000001',
    '2026-08-21 15:00:00+00',
    '19600000-0000-0000-0000-000000000001'
  );

SELECT is(
  public.create_weekly_financial_summary_notifications(
    '2026-08-25 12:00:00+00'
  ),
  0,
  'the weekly summary does not run on Tuesday'
);
SELECT is(
  public.create_weekly_financial_summary_notifications(
    '2026-08-24 10:59:00+00'
  ),
  0,
  'the weekly summary does not run before 08:00 local time'
);
SELECT is(
  public.create_weekly_financial_summary_notifications(
    '2026-08-24 12:00:00+00'
  ),
  4,
  'Monday creates one summary for each active authorized manager'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29600000-0000-0000-0000-000000000001'
      AND title = 'Resumo financeiro semanal'
      AND action_url = '/financeiro'
      AND kind = 'financial'
  ),
  3::bigint,
  'owner administrator and manager receive the active tenant summary'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29600000-0000-0000-0000-000000000001'
      AND user_id IN (
        '19600000-0000-0000-0000-000000000004',
        '19600000-0000-0000-0000-000000000005'
      )
      AND dedupe_key LIKE 'weekly-financial-summary:%'
  ),
  0::bigint,
  'operator and inactive manager receive no financial summary'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id IN (
      '29600000-0000-0000-0000-000000000002',
      '29600000-0000-0000-0000-000000000003'
    )
      AND dedupe_key LIKE 'weekly-financial-summary:%'
  ),
  0::bigint,
  'financially hidden and archived organizations receive no summary'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notifications
    WHERE organization_id = '29600000-0000-0000-0000-000000000004'
      AND user_id = '19600000-0000-0000-0000-000000000008'
      AND body LIKE '%R$ 0,00%'
  ),
  1::bigint,
  'a missing timezone uses Sao Paulo and safely summarizes empty finances'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE organization_id = '29600000-0000-0000-0000-000000000001'
      AND user_id = '19600000-0000-0000-0000-000000000001'
      AND body LIKE '%R$ 1300,00 a receber e R$ 550,00 a pagar%'
      AND body LIKE '%Vencidos: 2 contas, total de R$ 1150,00%'
      AND body LIKE '%R$ 700,00 recebidos e R$ 50,00 pagos%'
      AND body LIKE '%R$ 300,00 a receber e R$ 400,00 a pagar%'
      AND body LIKE '%Saldo das contas: R$ 1500,00%'
  ),
  'the notification contains the complete and correct financial rollup'
);
SELECT is(
  public.create_weekly_financial_summary_notifications(
    '2026-08-24 12:15:00+00'
  ),
  0,
  'replaying the same Monday does not duplicate a recipient summary'
);
SELECT is(
  public.create_weekly_financial_summary_notifications(
    '2026-08-31 12:00:00+00'
  ),
  4,
  'a new civil week creates a new summary exactly once'
);

SELECT is(
  (
    SELECT current_balance
    FROM public.financial_accounts
    WHERE id = '39600000-0000-0000-0000-000000000001'
  ),
  1000::numeric,
  'the summary never moves an account balance'
);
SELECT is(
  (
    SELECT status
    FROM public.financial_transactions
    WHERE id = '79600000-0000-0000-0000-000000000004'
  ),
  'partial',
  'the summary never changes a financial transaction'
);
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the weekly summary creates no additional clock'
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
  ) LIKE '%weekly_financial_summaries_created%'
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
  'the temporal cycle preserves every prior stage and adds the weekly summary'
);

SELECT * FROM finish();
ROLLBACK;
