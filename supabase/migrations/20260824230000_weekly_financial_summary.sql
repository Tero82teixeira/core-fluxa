-- Stage 36: send one consolidated internal financial summary every Monday
-- after 08:00 in each active organization's timezone. The scan is private,
-- tenant-derived, idempotent by week and recipient, and reuses the existing
-- fifteen-minute clock without changing financial records.

CREATE OR REPLACE FUNCTION public.create_weekly_financial_summary_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_count integer := 0;
BEGIN
  WITH organization_timezones AS (
    SELECT
      organization.id AS organization_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM pg_catalog.pg_timezone_names AS zone
          WHERE zone.name = settings.timezone
        ) THEN settings.timezone
        ELSE 'America/Sao_Paulo'
      END AS timezone_name
    FROM public.organizations AS organization
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    WHERE organization.archived_at IS NULL
      AND coalesce(settings.monitoring_show_financial, true)
  ), organization_clock AS (
    SELECT
      config.*,
      _as_of AT TIME ZONE config.timezone_name AS local_now
    FROM organization_timezones AS config
  ), reporting_organizations AS (
    SELECT
      config.organization_id,
      config.timezone_name,
      config.local_now::date AS organization_date,
      date_trunc('week', config.local_now)::date AS week_start
    FROM organization_clock AS config
    WHERE extract(isodow FROM config.local_now) = 1
      AND config.local_now::time >= time '08:00'
  ), open_transactions AS (
    SELECT
      config.organization_id,
      config.organization_date,
      config.week_start,
      financial.id,
      financial.type,
      financial.due_date,
      greatest(
        financial.amount - coalesce(payment.paid_total, 0),
        0
      ) AS open_balance
    FROM reporting_organizations AS config
    JOIN public.financial_transactions AS financial
      ON financial.organization_id = config.organization_id
     AND financial.archived_at IS NULL
     AND financial.status IN ('pending', 'partial', 'overdue')
    LEFT JOIN LATERAL (
      SELECT sum(transaction_payment.amount) AS paid_total
      FROM public.financial_transaction_payments AS transaction_payment
      WHERE transaction_payment.organization_id = financial.organization_id
        AND transaction_payment.transaction_id = financial.id
        AND transaction_payment.reversed_at IS NULL
    ) AS payment ON true
  ), open_totals AS (
    SELECT
      financial.organization_id,
      coalesce(sum(financial.open_balance) FILTER (
        WHERE financial.type = 'income'
      ), 0) AS open_receivables,
      coalesce(sum(financial.open_balance) FILTER (
        WHERE financial.type = 'expense'
      ), 0) AS open_payables,
      count(*) FILTER (
        WHERE financial.due_date < financial.organization_date
          AND financial.open_balance > 0
      )::integer AS overdue_count,
      coalesce(sum(financial.open_balance) FILTER (
        WHERE financial.due_date < financial.organization_date
          AND financial.open_balance > 0
      ), 0) AS overdue_amount,
      coalesce(sum(financial.open_balance) FILTER (
        WHERE financial.type = 'income'
          AND financial.due_date >= financial.organization_date
          AND financial.due_date < financial.organization_date + 7
      ), 0) AS upcoming_receivables,
      coalesce(sum(financial.open_balance) FILTER (
        WHERE financial.type = 'expense'
          AND financial.due_date >= financial.organization_date
          AND financial.due_date < financial.organization_date + 7
      ), 0) AS upcoming_payables
    FROM open_transactions AS financial
    GROUP BY financial.organization_id
  ), previous_week_payments AS (
    SELECT
      config.organization_id,
      coalesce(sum(payment.amount) FILTER (
        WHERE financial.type = 'income'
      ), 0) AS received_last_week,
      coalesce(sum(payment.amount) FILTER (
        WHERE financial.type = 'expense'
      ), 0) AS paid_last_week
    FROM reporting_organizations AS config
    JOIN public.financial_transaction_payments AS payment
      ON payment.organization_id = config.organization_id
     AND payment.reversed_at IS NULL
     AND (payment.paid_at AT TIME ZONE config.timezone_name)::date
       >= config.week_start - 7
     AND (payment.paid_at AT TIME ZONE config.timezone_name)::date
       < config.week_start
    JOIN public.financial_transactions AS financial
      ON financial.organization_id = config.organization_id
     AND financial.id = payment.transaction_id
    GROUP BY config.organization_id
  ), account_totals AS (
    SELECT
      config.organization_id,
      coalesce(sum(account.current_balance), 0) AS account_balance
    FROM reporting_organizations AS config
    JOIN public.financial_accounts AS account
      ON account.organization_id = config.organization_id
     AND account.archived_at IS NULL
     AND account.is_active
    GROUP BY config.organization_id
  ), summaries AS (
    SELECT
      config.organization_id,
      config.week_start,
      coalesce(open_summary.open_receivables, 0) AS open_receivables,
      coalesce(open_summary.open_payables, 0) AS open_payables,
      coalesce(open_summary.overdue_count, 0) AS overdue_count,
      coalesce(open_summary.overdue_amount, 0) AS overdue_amount,
      coalesce(payment.received_last_week, 0) AS received_last_week,
      coalesce(payment.paid_last_week, 0) AS paid_last_week,
      coalesce(open_summary.upcoming_receivables, 0) AS upcoming_receivables,
      coalesce(open_summary.upcoming_payables, 0) AS upcoming_payables,
      coalesce(account.account_balance, 0) AS account_balance
    FROM reporting_organizations AS config
    LEFT JOIN open_totals AS open_summary
      ON open_summary.organization_id = config.organization_id
    LEFT JOIN previous_week_payments AS payment
      ON payment.organization_id = config.organization_id
    LEFT JOIN account_totals AS account
      ON account.organization_id = config.organization_id
  ), recipients AS (
    SELECT summary.*, member.user_id
    FROM summaries AS summary
    JOIN public.organization_members AS member
      ON member.organization_id = summary.organization_id
     AND member.is_active
     AND member.role::text IN (
       'superadmin', 'proprietario', 'administrador', 'gestor'
     )
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, action_url, dedupe_key
  )
  SELECT
    summary.organization_id,
    summary.user_id,
    'Resumo financeiro semanal',
    format(
      'Em aberto: R$ %s a receber e R$ %s a pagar. Vencidos: %s %s, total de R$ %s. Semana anterior: R$ %s recebidos e R$ %s pagos. Próximos 7 dias: R$ %s a receber e R$ %s a pagar. Saldo das contas: R$ %s.',
      replace(to_char(summary.open_receivables, 'FM999999999999990D00'), '.', ','),
      replace(to_char(summary.open_payables, 'FM999999999999990D00'), '.', ','),
      summary.overdue_count,
      CASE WHEN summary.overdue_count = 1 THEN 'conta' ELSE 'contas' END,
      replace(to_char(summary.overdue_amount, 'FM999999999999990D00'), '.', ','),
      replace(to_char(summary.received_last_week, 'FM999999999999990D00'), '.', ','),
      replace(to_char(summary.paid_last_week, 'FM999999999999990D00'), '.', ','),
      replace(to_char(summary.upcoming_receivables, 'FM999999999999990D00'), '.', ','),
      replace(to_char(summary.upcoming_payables, 'FM999999999999990D00'), '.', ','),
      replace(to_char(summary.account_balance, 'FM999999999999990D00'), '.', ',')
    ),
    'financial',
    '/financeiro',
    'weekly-financial-summary:' || summary.week_start::text || ':' ||
      summary.user_id::text
  FROM recipients AS summary
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Preserve every previously approved temporal stage and isolate this summary.
-- No additional pg_cron job is created by this migration.
CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scheduled_count integer;
  critical_count integer := 0;
  unassigned_count integer := 0;
  deadline_count integer := 0;
  overdue_escalation_count integer := 0;
  stale_process_count integer := 0;
  overdue_communication_count integer := 0;
  expired_document_count integer := 0;
  overdue_financial_count integer := 0;
  financial_recurrence_count integer := 0;
  weekly_financial_summary_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    financial_recurrence_count :=
      public.process_due_financial_recurrences();
  EXCEPTION WHEN OTHERS THEN
    financial_recurrence_count := -1;
    RAISE WARNING 'FINANCIAL_RECURRENCE_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_financial_summary_count :=
      public.create_weekly_financial_summary_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_financial_summary_count := -1;
    RAISE WARNING 'WEEKLY_FINANCIAL_SUMMARY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    critical_count := public.create_critical_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    critical_count := -1;
    RAISE WARNING 'CRITICAL_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    unassigned_count := public.create_unassigned_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    unassigned_count := -1;
    RAISE WARNING 'UNASSIGNED_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    deadline_count := public.create_deadline_reminder_notifications();
  EXCEPTION WHEN OTHERS THEN
    deadline_count := -1;
    RAISE WARNING 'DEADLINE_REMINDER_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_escalation_count :=
      public.create_overdue_task_escalation_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_escalation_count := -1;
    RAISE WARNING 'OVERDUE_TASK_ESCALATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_process_count := public.create_stale_process_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_process_count := -1;
    RAISE WARNING 'STALE_PROCESS_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_communication_count :=
      public.create_overdue_communication_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_communication_count := -1;
    RAISE WARNING 'OVERDUE_COMMUNICATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    expired_document_count :=
      public.create_expired_document_notifications();
  EXCEPTION WHEN OTHERS THEN
    expired_document_count := -1;
    RAISE WARNING 'EXPIRED_DOCUMENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_financial_count :=
      public.create_overdue_financial_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_financial_count := -1;
    RAISE WARNING 'OVERDUE_FINANCIAL_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created',
      financial_recurrence_count,
    'weekly_financial_summaries_created',
      weekly_financial_summary_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_weekly_financial_summary_notifications(
  timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_weekly_financial_summary_notifications(
  timestamptz
) TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
