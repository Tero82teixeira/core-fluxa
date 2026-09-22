-- FLUXA Saúde: alertas temporais e gerenciais integrados ao relógio único.
-- Reutiliza run_temporal_automation_cycle(); nenhum novo pg_cron é criado.

CREATE OR REPLACE FUNCTION public.create_health_operational_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  created_count integer := 0;
BEGIN
  WITH health_orgs AS (
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
      AND settings.business_segment = 'health'
  ), alert_candidates AS (
    -- Autorizações próximas do vencimento.
    SELECT
      authorization.organization_id,
      'authorization'::text AS alert_type,
      authorization.id AS entity_id,
      '/saude/autorizacoes'::text AS action_url,
      CASE
        WHEN authorization.valid_until = (_as_of AT TIME ZONE org.timezone_name)::date
          THEN 'Autorização vence hoje'
        WHEN authorization.valid_until = ((_as_of AT TIME ZONE org.timezone_name)::date + 1)
          THEN 'Autorização vence amanhã'
        ELSE 'Autorização próxima do vencimento'
      END AS title,
      format(
        '%s · validade %s.',
        left(authorization.service_label, 120),
        to_char(authorization.valid_until, 'DD/MM/YYYY')
      ) AS body,
      'health-authorization:' || authorization.id::text || ':' ||
        authorization.valid_until::text AS dedupe_base,
      ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::text[]
        AS recipient_roles
    FROM public.health_authorizations authorization
    JOIN health_orgs org ON org.organization_id = authorization.organization_id
    WHERE public.health_module_enabled(authorization.organization_id, 'health_authorizations')
      AND authorization.status = 'autorizado'
      AND authorization.valid_until IS NOT NULL
      AND authorization.valid_until BETWEEN
        (_as_of AT TIME ZONE org.timezone_name)::date
        AND ((_as_of AT TIME ZONE org.timezone_name)::date + 7)

    UNION ALL

    -- Lotes com previsão de pagamento vencida.
    SELECT
      batch.organization_id,
      'billing_batch_overdue',
      batch.id,
      '/saude/conciliacao',
      CASE
        WHEN ((_as_of AT TIME ZONE org.timezone_name)::date - batch.expected_payment_at) >= 30
          THEN 'Pagamento de lote atrasado há 30+ dias'
        WHEN ((_as_of AT TIME ZONE org.timezone_name)::date - batch.expected_payment_at) >= 7
          THEN 'Pagamento de lote atrasado há 7+ dias'
        ELSE 'Pagamento de lote em atraso'
      END,
      format(
        '%s · referência %s · previsão %s.',
        insurer.name,
        batch.reference_period,
        to_char(batch.expected_payment_at, 'DD/MM/YYYY')
      ),
      'health-batch-overdue:' || batch.id::text || ':' ||
        CASE
          WHEN ((_as_of AT TIME ZONE org.timezone_name)::date - batch.expected_payment_at) >= 30 THEN '30'
          WHEN ((_as_of AT TIME ZONE org.timezone_name)::date - batch.expected_payment_at) >= 7 THEN '7'
          ELSE '1'
        END,
      ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::text[]
    FROM public.health_billing_batches batch
    JOIN health_orgs org ON org.organization_id = batch.organization_id
    JOIN public.health_insurers insurer
      ON insurer.id = batch.insurer_id
     AND insurer.organization_id = batch.organization_id
    WHERE public.health_module_enabled(batch.organization_id, 'health_billing')
      AND batch.expected_payment_at IS NOT NULL
      AND batch.expected_payment_at < (_as_of AT TIME ZONE org.timezone_name)::date
      AND batch.status NOT IN ('pago','cancelado')

    UNION ALL

    -- Glosas próximas do prazo final de recurso.
    SELECT
      denial.organization_id,
      'denial_appeal_due',
      denial.id,
      '/saude/glosas',
      CASE
        WHEN denial.appeal_due_date = (_as_of AT TIME ZONE org.timezone_name)::date
          THEN 'Prazo de recurso de glosa vence hoje'
        WHEN denial.appeal_due_date = ((_as_of AT TIME ZONE org.timezone_name)::date + 1)
          THEN 'Prazo de recurso de glosa vence amanhã'
        ELSE 'Prazo de recurso de glosa próximo'
      END,
      format(
        'Glosa de R$ %s · prazo %s.',
        denial.denied_amount::text,
        to_char(denial.appeal_due_date, 'DD/MM/YYYY')
      ),
      'health-denial-due:' || denial.id::text || ':' || denial.appeal_due_date::text,
      ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::text[]
    FROM public.health_denials denial
    JOIN health_orgs org ON org.organization_id = denial.organization_id
    WHERE public.health_module_enabled(denial.organization_id, 'health_denials')
      AND denial.status = 'aberta'
      AND denial.appeal_due_date IS NOT NULL
      AND denial.appeal_due_date BETWEEN
        (_as_of AT TIME ZONE org.timezone_name)::date
        AND ((_as_of AT TIME ZONE org.timezone_name)::date + 7)

    UNION ALL

    -- Convênio com índice de glosa líquido elevado na janela recente.
    SELECT
      stats.organization_id,
      'insurer_high_denial_rate',
      stats.insurer_id,
      '/saude/painel-faturamento',
      'Índice de glosa elevado: ' || stats.insurer_name,
      format(
        'Nos últimos 30 dias, %s%% do valor faturado foi glosado líquido.',
        round((100 * stats.net_denied_amount / NULLIF(stats.billed_amount, 0))::numeric, 1)::text
      ),
      'health-insurer-denial-rate:' || stats.insurer_id::text || ':' ||
        to_char(date_trunc('week', (_as_of AT TIME ZONE stats.timezone_name)::date), 'IYYY-IW'),
      ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::text[]
    FROM (
      SELECT
        billing.organization_id,
        billing.insurer_id,
        insurer.name AS insurer_name,
        org.timezone_name,
        count(*) AS billing_count,
        sum(billing.amount)::numeric AS billed_amount,
        sum(COALESCE(denial_totals.net_denied, 0))::numeric AS net_denied_amount
      FROM public.health_billing_items billing
      JOIN health_orgs org ON org.organization_id = billing.organization_id
      JOIN public.health_insurers insurer
        ON insurer.id = billing.insurer_id
       AND insurer.organization_id = billing.organization_id
      LEFT JOIN LATERAL (
        SELECT sum(GREATEST(denial.denied_amount - denial.recovered_amount, 0)) AS net_denied
        FROM public.health_denials denial
        WHERE denial.billing_item_id = billing.id
          AND denial.organization_id = billing.organization_id
          AND denial.status <> 'cancelada'
      ) denial_totals ON true
      WHERE public.health_module_enabled(billing.organization_id, 'health_denials')
        AND billing.insurer_id IS NOT NULL
        AND billing.service_date >= ((_as_of AT TIME ZONE org.timezone_name)::date - 30)
      GROUP BY billing.organization_id, billing.insurer_id, insurer.name, org.timezone_name
    ) stats
    WHERE stats.billing_count >= 5
      AND stats.billed_amount > 0
      AND stats.net_denied_amount / stats.billed_amount >= 0.10
  ), recipients AS (
    SELECT
      alert.organization_id,
      member.user_id,
      alert.alert_type,
      alert.entity_id,
      alert.action_url,
      alert.title,
      alert.body,
      alert.dedupe_base
    FROM alert_candidates alert
    JOIN public.organization_members member
      ON member.organization_id = alert.organization_id
     AND member.is_active
     AND member.role::text = ANY(alert.recipient_roles)
  )
  INSERT INTO public.notifications(
    organization_id,
    user_id,
    kind,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    dedupe_key
  )
  SELECT
    recipient.organization_id,
    recipient.user_id,
    'health',
    left(recipient.title, 160),
    left(recipient.body, 500),
    recipient.alert_type,
    recipient.entity_id,
    recipient.action_url,
    recipient.dedupe_base || ':' || recipient.user_id::text
  FROM recipients recipient
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
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
  weekly_data_quality_count integer := 0;
  stale_client_count integer := 0;
  client_birthday_count integer := 0;
  stale_lead_count integer := 0;
  stale_task_count integer := 0;
  daily_operational_close_count integer := 0;
  weekly_productivity_report_count integer := 0;
  kiwify_expiry_count integer := 0;
  commercial_next_action_count integer := 0;
  health_alert_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    kiwify_expiry_count := public.suspend_expired_kiwify_subscriptions();
  EXCEPTION WHEN OTHERS THEN
    kiwify_expiry_count := -1;
    RAISE WARNING 'KIWIFY_SUBSCRIPTION_EXPIRY_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_productivity_report_count := public.create_weekly_productivity_report_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_productivity_report_count := -1;
    RAISE WARNING 'WEEKLY_PRODUCTIVITY_REPORT_FAILED: %', SQLSTATE;
  END;

  BEGIN
    daily_operational_close_count := public.create_daily_operational_close_notifications();
  EXCEPTION WHEN OTHERS THEN
    daily_operational_close_count := -1;
    RAISE WARNING 'DAILY_OPERATIONAL_CLOSE_FAILED: %', SQLSTATE;
  END;

  BEGIN
    financial_recurrence_count := public.process_due_financial_recurrences();
  EXCEPTION WHEN OTHERS THEN
    financial_recurrence_count := -1;
    RAISE WARNING 'FINANCIAL_RECURRENCE_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_financial_summary_count := public.create_weekly_financial_summary_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_financial_summary_count := -1;
    RAISE WARNING 'WEEKLY_FINANCIAL_SUMMARY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_data_quality_count := public.create_weekly_data_quality_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_data_quality_count := -1;
    RAISE WARNING 'WEEKLY_DATA_QUALITY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_client_count := public.create_stale_client_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_client_count := -1;
    RAISE WARNING 'STALE_CLIENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    client_birthday_count := public.create_client_birthday_notifications();
  EXCEPTION WHEN OTHERS THEN
    client_birthday_count := -1;
    RAISE WARNING 'CLIENT_BIRTHDAY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_lead_count := public.create_stale_lead_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_lead_count := -1;
    RAISE WARNING 'STALE_LEAD_SCAN_FAILED: %', SQLSTATE;
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
    overdue_escalation_count := public.create_overdue_task_escalation_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_escalation_count := -1;
    RAISE WARNING 'OVERDUE_TASK_ESCALATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_task_count := public.create_stale_task_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_task_count := -1;
    RAISE WARNING 'STALE_TASK_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_process_count := public.create_stale_process_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_process_count := -1;
    RAISE WARNING 'STALE_PROCESS_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_communication_count := public.create_overdue_communication_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_communication_count := -1;
    RAISE WARNING 'OVERDUE_COMMUNICATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    expired_document_count := public.create_expired_document_notifications();
  EXCEPTION WHEN OTHERS THEN
    expired_document_count := -1;
    RAISE WARNING 'EXPIRED_DOCUMENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_financial_count := public.create_overdue_financial_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_financial_count := -1;
    RAISE WARNING 'OVERDUE_FINANCIAL_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    commercial_next_action_count := public.create_commercial_next_action_notifications();
  EXCEPTION WHEN OTHERS THEN
    commercial_next_action_count := -1;
    RAISE WARNING 'COMMERCIAL_NEXT_ACTION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    health_alert_count := public.create_health_operational_notifications();
  EXCEPTION WHEN OTHERS THEN
    health_alert_count := -1;
    RAISE WARNING 'HEALTH_OPERATIONAL_ALERT_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'kiwify_subscriptions_suspended', kiwify_expiry_count,
    'weekly_productivity_reports_created', weekly_productivity_report_count,
    'daily_operational_close_notifications_created', daily_operational_close_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_task_notifications_created', stale_task_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created', overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created', financial_recurrence_count,
    'weekly_financial_summaries_created', weekly_financial_summary_count,
    'weekly_data_quality_notifications_created', weekly_data_quality_count,
    'stale_client_notifications_created', stale_client_count,
    'client_birthday_notifications_created', client_birthday_count,
    'stale_lead_notifications_created', stale_lead_count,
    'commercial_next_action_notifications_created', commercial_next_action_count,
    'health_operational_notifications_created', health_alert_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_health_operational_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_health_operational_notifications(timestamptz)
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
