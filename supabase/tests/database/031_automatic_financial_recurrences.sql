BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'UTC';
SELECT no_plan();

SELECT has_function(
  'public', 'process_due_financial_recurrences', ARRAY[]::text[],
  'private automatic financial-recurrence processor exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.process_due_financial_recurrences()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.process_due_financial_recurrences()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.process_due_financial_recurrences()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.process_due_financial_recurrences()', 'EXECUTE'
  ),
  'only postgres can invoke the automatic recurrence processor'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.generate_recurrence_transactions(uuid,jsonb)', 'EXECUTE'
  ),
  'the authenticated manual fallback remains available'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES (
  '19500000-0000-0000-0000-000000000001',
  'automatic-recurrence-owner@fluxa.test', '{}',
  'authenticated', 'authenticated', '', now()
);

INSERT INTO public.organizations(id, legal_name, archived_at) VALUES
  (
    '29500000-0000-0000-0000-000000000001',
    'Automatic Recurrence Tenant', NULL
  ),
  (
    '29500000-0000-0000-0000-000000000002',
    'Archived Recurrence Tenant', now()
  ),
  (
    '29500000-0000-0000-0000-000000000003',
    'Missing Timezone Tenant', NULL
  );

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  (
    '29500000-0000-0000-0000-000000000001',
    '19500000-0000-0000-0000-000000000001',
    'proprietario', true
  ),
  (
    '29500000-0000-0000-0000-000000000003',
    '19500000-0000-0000-0000-000000000001',
    'proprietario', true
  );

INSERT INTO public.organization_settings(organization_id, timezone) VALUES (
  '29500000-0000-0000-0000-000000000001',
  'America/Manaus'
);

INSERT INTO public.financial_accounts(
  id, organization_id, name, type, initial_balance, current_balance,
  created_by
) VALUES (
  '39500000-0000-0000-0000-000000000001',
  '29500000-0000-0000-0000-000000000001',
  'Automatic recurrence account', 'bank', 50, 50,
  '19500000-0000-0000-0000-000000000001'
);

INSERT INTO public.financial_recurrences(
  id, organization_id, name, type, amount, account_id, frequency,
  interval_count, start_date, end_date, next_run_date, status,
  created_by, archived_at
) VALUES
  (
    'a9500000-0000-0000-0000-000000000001',
    '29500000-0000-0000-0000-000000000001',
    'Weekly active recurrence', 'income', 100,
    '39500000-0000-0000-0000-000000000001', 'weekly', 1,
    (now() AT TIME ZONE 'America/Manaus')::date - 14,
    NULL,
    (now() AT TIME ZONE 'America/Manaus')::date - 14,
    'active', '19500000-0000-0000-0000-000000000001', NULL
  ),
  (
    'a9500000-0000-0000-0000-000000000002',
    '29500000-0000-0000-0000-000000000001',
    'Paused recurrence', 'expense', 10, NULL, 'weekly', 1,
    (now() AT TIME ZONE 'America/Manaus')::date,
    NULL,
    (now() AT TIME ZONE 'America/Manaus')::date,
    'paused', '19500000-0000-0000-0000-000000000001', NULL
  ),
  (
    'a9500000-0000-0000-0000-000000000003',
    '29500000-0000-0000-0000-000000000001',
    'Future recurrence', 'income', 10, NULL, 'monthly', 1,
    (now() AT TIME ZONE 'America/Manaus')::date + 1,
    NULL,
    (now() AT TIME ZONE 'America/Manaus')::date + 1,
    'active', '19500000-0000-0000-0000-000000000001', NULL
  ),
  (
    'a9500000-0000-0000-0000-000000000004',
    '29500000-0000-0000-0000-000000000001',
    'Archived recurrence', 'income', 10, NULL, 'monthly', 1,
    (now() AT TIME ZONE 'America/Manaus')::date,
    NULL,
    (now() AT TIME ZONE 'America/Manaus')::date,
    'active', '19500000-0000-0000-0000-000000000001', now()
  ),
  (
    'a9500000-0000-0000-0000-000000000005',
    '29500000-0000-0000-0000-000000000002',
    'Archived tenant recurrence', 'income', 10, NULL, 'monthly', 1,
    current_date, NULL, current_date,
    'active', '19500000-0000-0000-0000-000000000001', NULL
  ),
  (
    'a9500000-0000-0000-0000-000000000006',
    '29500000-0000-0000-0000-000000000001',
    'Ends today recurrence', 'expense', 20, NULL, 'monthly', 1,
    (now() AT TIME ZONE 'America/Manaus')::date,
    (now() AT TIME ZONE 'America/Manaus')::date,
    (now() AT TIME ZONE 'America/Manaus')::date,
    'active', '19500000-0000-0000-0000-000000000001', NULL
  ),
  (
    'a9500000-0000-0000-0000-000000000007',
    '29500000-0000-0000-0000-000000000001',
    'Already generated recurrence', 'income', 30, NULL, 'weekly', 1,
    (now() AT TIME ZONE 'America/Manaus')::date,
    NULL,
    (now() AT TIME ZONE 'America/Manaus')::date,
    'active', '19500000-0000-0000-0000-000000000001', NULL
  ),
  (
    'a9500000-0000-0000-0000-000000000008',
    '29500000-0000-0000-0000-000000000003',
    'Missing timezone fallback recurrence', 'income', 40, NULL, 'weekly', 1,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    NULL,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'active', '19500000-0000-0000-0000-000000000001', NULL
  ),
  (
    'a9500000-0000-0000-0000-000000000009',
    '29500000-0000-0000-0000-000000000001',
    'Bounded backlog recurrence', 'income', 1, NULL, 'weekly', 1,
    (now() AT TIME ZONE 'America/Manaus')::date - (120 * 7),
    NULL,
    (now() AT TIME ZONE 'America/Manaus')::date - (120 * 7),
    'active', '19500000-0000-0000-0000-000000000001', NULL
  );

INSERT INTO public.financial_transactions(
  id, organization_id, type, description, amount, status, due_date,
  competence_date, recurrence_id, recurrence_due_date, created_by
) VALUES (
  'b9500000-0000-0000-0000-000000000001',
  '29500000-0000-0000-0000-000000000001',
  'income', 'Already generated recurrence', 30, 'pending',
  (now() AT TIME ZONE 'America/Manaus')::date,
  (now() AT TIME ZONE 'America/Manaus')::date,
  'a9500000-0000-0000-0000-000000000007',
  (now() AT TIME ZONE 'America/Manaus')::date,
  '19500000-0000-0000-0000-000000000001'
);

SELECT is(
  public.process_due_financial_recurrences(), 125,
  'due recurrences generate expected transactions with a bounded backlog'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.financial_transactions
    WHERE recurrence_id = 'a9500000-0000-0000-0000-000000000001'
  ),
  3::bigint,
  'weekly backlog is recovered through the organization civil date'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.financial_transactions
    WHERE recurrence_id IN (
      'a9500000-0000-0000-0000-000000000002',
      'a9500000-0000-0000-0000-000000000003',
      'a9500000-0000-0000-0000-000000000004',
      'a9500000-0000-0000-0000-000000000005'
    )
  ),
  'paused future archived and archived-tenant recurrences are ignored'
);
SELECT is(
  (
    SELECT status
    FROM public.financial_recurrences
    WHERE id = 'a9500000-0000-0000-0000-000000000006'
  ),
  'finished',
  'a recurrence is finished after its final configured occurrence'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.financial_transactions
    WHERE recurrence_id = 'a9500000-0000-0000-0000-000000000007'
  ),
  1::bigint,
  'an already generated due date is not duplicated'
);
SELECT is(
  (
    SELECT next_run_date
    FROM public.financial_recurrences
    WHERE id = 'a9500000-0000-0000-0000-000000000007'
  ),
  (now() AT TIME ZONE 'America/Manaus')::date + 7,
  'an existing occurrence still advances the recurrence safely'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.financial_transactions
    WHERE recurrence_id = 'a9500000-0000-0000-0000-000000000008'
  ),
  1::bigint,
  'a missing organization timezone uses the Sao Paulo fallback'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.financial_transactions
    WHERE recurrence_id = 'a9500000-0000-0000-0000-000000000009'
  ),
  120::bigint,
  'one recurrence creates no more than 120 backlog items per cycle'
);
SELECT is(
  (
    SELECT current_balance
    FROM public.financial_accounts
    WHERE id = '39500000-0000-0000-0000-000000000001'
  ),
  50::numeric,
  'automatic recurrence generation does not move account balance'
);
SELECT is(
  (SELECT count(*) FROM public.financial_transaction_payments),
  0::bigint,
  'automatic recurrence generation does not create payments'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.financial_transactions
    WHERE recurrence_id IS NOT NULL
      AND (
        status <> 'pending'
        OR created_by <> '19500000-0000-0000-0000-000000000001'
      )
  ),
  'generated transactions remain pending and preserve the recurrence creator'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_logs
    WHERE action = 'financial.recurrence.generated'
      AND actor_id IS NULL
      AND actor_name = 'Automação'
      AND metadata->>'automatic' = 'true'
  ),
  4::bigint,
  'successful automatic generations create system audit entries'
);

SELECT is(
  public.process_due_financial_recurrences(), 1,
  'the next cycle continues the bounded backlog'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.financial_transactions
    WHERE recurrence_id = 'a9500000-0000-0000-0000-000000000009'
  ),
  121::bigint,
  'the remaining bounded occurrence is created exactly once'
);
SELECT is(
  public.process_due_financial_recurrences(), 0,
  'a repeated cycle is idempotent after the backlog is current'
);
SELECT is(
  (
    SELECT count(*)
    FROM cron.job
    WHERE jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1::bigint,
  'the existing temporal cron remains single'
);
SELECT ok(
  pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%financial_recurrence_transactions_created%'
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
  ) LIKE '%process_due_scheduled_automations()%'
  ,
  'the temporal cycle preserves all prior scans and adds recurrence generation'
);

SELECT * FROM finish();
ROLLBACK;
