-- Stage 34: complement the existing 30/15/7/1-day financial reminders with
-- post-due notices for open receivables and payables. This scan only creates
-- internal notifications and reuses the existing private fifteen-minute clock.

CREATE OR REPLACE FUNCTION public.create_overdue_financial_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_count integer := 0;
BEGIN
  WITH organization_config AS (
    SELECT
      organization.id AS organization_id,
      coalesce(settings.notification_preferences, '{}'::jsonb) AS preferences,
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
      AND coalesce(
        settings.notification_preferences->>'overdue_accounts', 'true'
      ) <> 'false'
  ), overdue_transactions AS (
    SELECT
      financial.organization_id,
      financial.id AS transaction_id,
      financial.type,
      financial.description,
      financial.due_date,
      financial.responsible_user_id,
      config.preferences,
      greatest(
        financial.amount - coalesce(payment.paid_total, 0),
        0
      ) AS open_balance,
      (
        (now() AT TIME ZONE config.timezone_name)::date
        - financial.due_date
      )::integer AS overdue_days
    FROM public.financial_transactions AS financial
    JOIN organization_config AS config
      ON config.organization_id = financial.organization_id
    LEFT JOIN LATERAL (
      SELECT sum(transaction_payment.amount) AS paid_total
      FROM public.financial_transaction_payments AS transaction_payment
      WHERE transaction_payment.organization_id = financial.organization_id
        AND transaction_payment.transaction_id = financial.id
        AND transaction_payment.reversed_at IS NULL
    ) AS payment ON true
    WHERE financial.archived_at IS NULL
      AND financial.status IN ('pending', 'partial', 'overdue')
      AND financial.due_date <
        (now() AT TIME ZONE config.timezone_name)::date
  ), eligible_transactions AS (
    SELECT
      financial.*,
      CASE
        WHEN financial.overdue_days >= 30 THEN 3
        WHEN financial.overdue_days >= 7 THEN 2
        ELSE 1
      END AS notice_stage,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = financial.organization_id
            AND member.user_id = monitoring_state.assigned_to
            AND member.is_active
            AND member.role::text IN (
              'superadmin', 'proprietario', 'administrador', 'gestor'
            )
        ) THEN monitoring_state.assigned_to
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = financial.organization_id
            AND member.user_id = financial.responsible_user_id
            AND member.is_active
            AND member.role::text IN (
              'superadmin', 'proprietario', 'administrador', 'gestor'
            )
        ) THEN financial.responsible_user_id
      END AS responsible_id
    FROM overdue_transactions AS financial
    LEFT JOIN public.monitoring_states AS monitoring_state
      ON monitoring_state.organization_id = financial.organization_id
     AND monitoring_state.source_type = 'financeiro'
     AND monitoring_state.source_id = financial.transaction_id
     AND monitoring_state.alert_kind = 'financeiro_vencido'
    WHERE financial.overdue_days >= 1
      AND financial.open_balance > 0
      AND coalesce(monitoring_state.monitoring_status, 'novo')
        NOT IN ('resolvido', 'ignorado')
      AND NOT (
        coalesce(financial.preferences->>'critical_monitoring', 'true')
          <> 'false'
        AND EXISTS (
          SELECT 1
          FROM public.operational_monitoring_alerts AS alert
          WHERE alert.organization_id = financial.organization_id
            AND alert.source_type = 'financeiro'
            AND alert.source_id = financial.transaction_id
            AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
            AND coalesce(alert.priority_override, alert.suggested_priority)
              = 'critica'
        )
      )
  ), recipients AS (
    SELECT financial.*, financial.responsible_id AS user_id
    FROM eligible_transactions AS financial
    WHERE financial.responsible_id IS NOT NULL

    UNION

    SELECT financial.*, manager.user_id
    FROM eligible_transactions AS financial
    JOIN public.organization_members AS manager
      ON manager.organization_id = financial.organization_id
     AND manager.is_active
     AND manager.role::text IN (
       'superadmin', 'proprietario', 'administrador'
     )
    WHERE financial.responsible_id IS NULL
       OR financial.notice_stage >= 2
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    financial.organization_id,
    financial.user_id,
    CASE
      WHEN financial.type = 'income' AND financial.notice_stage = 1
        THEN 'Recebimento vencido: '
      WHEN financial.type = 'expense' AND financial.notice_stage = 1
        THEN 'Conta a pagar vencida: '
      WHEN financial.notice_stage = 2
        THEN 'Escalonamento — conta vencida: '
      ELSE 'Alerta prolongado — conta vencida: '
    END || left(
      coalesce(nullif(trim(financial.description), ''), 'Conta sem descrição'),
      105
    ),
    CASE financial.notice_stage
      WHEN 1 THEN format(
        '%s está sem baixa há %s %s. Saldo em aberto: R$ %s.',
        CASE
          WHEN financial.type = 'income' THEN 'A cobrança'
          ELSE 'O pagamento'
        END,
        financial.overdue_days,
        CASE WHEN financial.overdue_days = 1 THEN 'dia' ELSE 'dias' END,
        financial.open_balance::text
      )
      WHEN 2 THEN format(
        'Vencida há %s dias e ainda sem baixa. Saldo em aberto: R$ %s. O responsável e a gestão foram avisados.',
        financial.overdue_days,
        financial.open_balance::text
      )
      ELSE format(
        'Vencida há %s dias e ainda sem regularização. Saldo em aberto: R$ %s.',
        financial.overdue_days,
        financial.open_balance::text
      )
    END,
    'financial',
    'financeiro',
    financial.transaction_id,
    '/financeiro',
    'overdue-financial:' || financial.transaction_id::text || ':' ||
      financial.due_date::text || ':' || financial.notice_stage::text || ':' ||
      financial.user_id::text
  FROM recipients AS financial
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Preserve every existing temporal scan and isolate this new category. No
-- additional pg_cron job is created by this migration.
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
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

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
    'overdue_financial_notifications_created', overdue_financial_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_overdue_financial_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_overdue_financial_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
