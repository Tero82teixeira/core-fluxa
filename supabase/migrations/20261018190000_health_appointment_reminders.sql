-- FLUXA Saúde: confirmação e lembretes administrativos da Agenda.
-- Reutiliza o relógio temporal único; nenhum novo cron é criado.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.

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
      authz.organization_id,
      'authorization'::text AS alert_type,
      authz.id AS entity_id,
      '/saude/autorizacoes'::text AS action_url,
      CASE
        WHEN authz.valid_until = (_as_of AT TIME ZONE org.timezone_name)::date
          THEN 'Autorização vence hoje'
        WHEN authz.valid_until = ((_as_of AT TIME ZONE org.timezone_name)::date + 1)
          THEN 'Autorização vence amanhã'
        ELSE 'Autorização próxima do vencimento'
      END AS title,
      format(
        '%s · validade %s.',
        left(authz.service_label, 120),
        to_char(authz.valid_until, 'DD/MM/YYYY')
      ) AS body,
      'health-authorization:' || authz.id::text || ':' ||
        authz.valid_until::text AS dedupe_base,
      ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::text[]
        AS recipient_roles
    FROM public.health_authorizations authz
    JOIN health_orgs org ON org.organization_id = authz.organization_id
    WHERE public.health_module_enabled(authz.organization_id, 'health_authorizations')
      AND authz.status = 'autorizado'
      AND authz.valid_until IS NOT NULL
      AND authz.valid_until BETWEEN
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


    UNION ALL

    -- Atendimentos nas próximas 24 horas ainda aguardando confirmação.
    SELECT
      appointment.organization_id,
      'appointment_confirmation_due',
      appointment.id,
      '/saude/agenda?date=' ||
        to_char(appointment.starts_at AT TIME ZONE org.timezone_name, 'YYYY-MM-DD'),
      'Atendimento aguardando confirmação',
      format(
        '%s · %s · %s.',
        left(client.name, 100),
        left(appointment.service_label, 100),
        to_char(appointment.starts_at AT TIME ZONE org.timezone_name, 'DD/MM/YYYY às HH24:MI')
      ),
      'health-appointment-confirm:' || appointment.id::text || ':' ||
        appointment.starts_at::text,
      ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::text[]
    FROM public.health_appointments appointment
    JOIN health_orgs org ON org.organization_id = appointment.organization_id
    JOIN public.health_patient_profiles patient
      ON patient.id = appointment.patient_profile_id
     AND patient.organization_id = appointment.organization_id
    JOIN public.clients client
      ON client.id = patient.client_id
     AND client.organization_id = appointment.organization_id
    WHERE public.health_module_enabled(appointment.organization_id, 'health_appointments')
      AND appointment.status = 'agendado'
      AND appointment.starts_at > _as_of
      AND appointment.starts_at <= (_as_of + interval '24 hours')

    UNION ALL

    -- Atendimentos confirmados que começam em até duas horas.
    SELECT
      appointment.organization_id,
      'appointment_upcoming',
      appointment.id,
      '/saude/agenda?date=' ||
        to_char(appointment.starts_at AT TIME ZONE org.timezone_name, 'YYYY-MM-DD'),
      'Atendimento confirmado em até 2 horas',
      format(
        '%s · %s · %s.',
        left(client.name, 100),
        left(appointment.service_label, 100),
        to_char(appointment.starts_at AT TIME ZONE org.timezone_name, 'HH24:MI')
      ),
      'health-appointment-upcoming:' || appointment.id::text || ':' ||
        appointment.starts_at::text,
      ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::text[]
    FROM public.health_appointments appointment
    JOIN health_orgs org ON org.organization_id = appointment.organization_id
    JOIN public.health_patient_profiles patient
      ON patient.id = appointment.patient_profile_id
     AND patient.organization_id = appointment.organization_id
    JOIN public.clients client
      ON client.id = patient.client_id
     AND client.organization_id = appointment.organization_id
    WHERE public.health_module_enabled(appointment.organization_id, 'health_appointments')
      AND appointment.status = 'confirmado'
      AND appointment.starts_at > _as_of
      AND appointment.starts_at <= (_as_of + interval '2 hours')

    UNION ALL

    -- Atendimentos encerrados sem resultado administrativo atualizado.
    SELECT
      appointment.organization_id,
      'appointment_outcome_pending',
      appointment.id,
      '/saude/agenda?date=' ||
        to_char(appointment.ends_at AT TIME ZONE org.timezone_name, 'YYYY-MM-DD'),
      'Atualize o resultado do atendimento',
      format(
        '%s · %s · horário encerrado às %s.',
        left(client.name, 100),
        left(appointment.service_label, 100),
        to_char(appointment.ends_at AT TIME ZONE org.timezone_name, 'HH24:MI')
      ),
      'health-appointment-outcome:' || appointment.id::text || ':' ||
        appointment.ends_at::text,
      ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::text[]
    FROM public.health_appointments appointment
    JOIN health_orgs org ON org.organization_id = appointment.organization_id
    JOIN public.health_patient_profiles patient
      ON patient.id = appointment.patient_profile_id
     AND patient.organization_id = appointment.organization_id
    JOIN public.clients client
      ON client.id = patient.client_id
     AND client.organization_id = appointment.organization_id
    WHERE public.health_module_enabled(appointment.organization_id, 'health_appointments')
      AND appointment.status IN ('agendado','confirmado')
      AND appointment.ends_at <= _as_of
      AND appointment.ends_at >= (_as_of - interval '24 hours')
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


REVOKE ALL ON FUNCTION public.create_health_operational_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_health_operational_notifications(timestamptz)
  TO postgres;
