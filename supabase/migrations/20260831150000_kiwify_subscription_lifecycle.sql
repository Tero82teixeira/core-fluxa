-- Preserve paid access after cancellation, provide the Kiwify five-day late
-- payment grace period and suspend expired access in the existing clock.

ALTER TABLE public.organization_subscriptions
  ADD COLUMN access_until timestamptz,
  ADD COLUMN next_payment_at timestamptz;

CREATE INDEX organization_subscriptions_access_expiry_idx
  ON public.organization_subscriptions(access_until, organization_id)
  WHERE status IN ('pending', 'past_due', 'canceled')
    AND access_until IS NOT NULL;

REVOKE ALL ON FUNCTION public.apply_kiwify_subscription_event(
  text, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.apply_kiwify_subscription_event(
  text, uuid, text, text, text, text, timestamptz
);

CREATE FUNCTION public.apply_kiwify_subscription_event(
  _event_key text,
  _organization uuid,
  _event_type text,
  _subscription_status text,
  _provider_order_id text DEFAULT NULL,
  _provider_subscription_id text DEFAULT NULL,
  _event_at timestamptz DEFAULT now(),
  _access_until timestamptz DEFAULT NULL,
  _next_payment_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  previous_event_at timestamptz;
  previous_access_until timestamptz;
  effective_access_until timestamptz;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _event_key IS NULL OR btrim(_event_key) = '' THEN
    RAISE EXCEPTION 'EVENT_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _subscription_status NOT IN (
    'pending', 'active', 'past_due', 'canceled', 'refunded', 'chargeback'
  ) THEN
    RAISE EXCEPTION 'INVALID_SUBSCRIPTION_STATUS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kiwify_webhook_events(
    event_key,
    organization_id,
    event_type,
    provider_order_id,
    provider_subscription_id
  ) VALUES (
    _event_key,
    _organization,
    _event_type,
    _provider_order_id,
    _provider_subscription_id
  )
  ON CONFLICT (event_key) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT subscription.last_event_at, subscription.access_until
    INTO previous_event_at, previous_access_until
    FROM public.organization_subscriptions subscription
   WHERE subscription.organization_id = _organization
     AND subscription.provider = 'kiwify'
   FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.kiwify_webhook_events
       SET processing_error = 'CHECKOUT_NOT_PREPARED'
     WHERE event_key = _event_key;
    RAISE EXCEPTION 'CHECKOUT_NOT_PREPARED' USING ERRCODE = 'P0002';
  END IF;

  IF previous_event_at IS NOT NULL AND _event_at < previous_event_at THEN
    UPDATE public.kiwify_webhook_events
       SET processed_at = now(),
           processing_error = 'STALE_EVENT_IGNORED'
     WHERE event_key = _event_key;
    RETURN false;
  END IF;

  effective_access_until := COALESCE(_access_until, previous_access_until);

  -- Kiwify retries a late Pix, boleto or card renewal for five days. The
  -- customer keeps access during that grace period.
  IF _subscription_status = 'past_due' THEN
    effective_access_until := GREATEST(
      COALESCE(effective_access_until, _event_at),
      _event_at + interval '5 days'
    );
  ELSIF _subscription_status IN ('refunded', 'chargeback') THEN
    effective_access_until := _event_at;
  END IF;

  UPDATE public.organization_subscriptions
     SET status = _subscription_status,
         provider_order_id = COALESCE(_provider_order_id, provider_order_id),
         provider_subscription_id = COALESCE(
           _provider_subscription_id,
           provider_subscription_id
         ),
         access_until = effective_access_until,
         next_payment_at = CASE
           WHEN _subscription_status IN ('canceled', 'refunded', 'chargeback')
             THEN NULL
           ELSE COALESCE(_next_payment_at, next_payment_at)
         END,
         last_event_type = _event_type,
         last_event_at = _event_at,
         updated_at = now()
   WHERE organization_id = _organization
     AND provider = 'kiwify';

  IF _subscription_status IN ('active', 'past_due')
     OR (
       _subscription_status = 'canceled'
       AND effective_access_until IS NOT NULL
       AND effective_access_until > _event_at
     )
  THEN
    UPDATE public.organizations
       SET commercial_status = 'active',
           trial_started_at = NULL,
           trial_ends_at = NULL,
           updated_at = now()
     WHERE id = _organization
       AND archived_at IS NULL;
  ELSIF _subscription_status IN ('canceled', 'refunded', 'chargeback') THEN
    UPDATE public.organizations
       SET commercial_status = 'suspended',
           updated_at = now()
     WHERE id = _organization
       AND archived_at IS NULL;
  END IF;

  UPDATE public.kiwify_webhook_events
     SET processed_at = now(),
         processing_error = NULL
   WHERE event_key = _event_key;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    _organization,
    NULL,
    'billing.subscription_event_processed',
    'organization_subscription',
    _organization,
    jsonb_build_object(
      'provider', 'kiwify',
      'event_type', _event_type,
      'subscription_status', _subscription_status,
      'event_key', _event_key,
      'access_until', effective_access_until
    )
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_kiwify_subscription_event(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_kiwify_subscription_event(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz
) TO service_role;

CREATE FUNCTION public.suspend_expired_kiwify_subscriptions(
  _now timestamptz DEFAULT now(),
  _limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target record;
  suspended_count integer := 0;
BEGIN
  IF _limit < 1 OR _limit > 500 THEN
    RAISE EXCEPTION 'INVALID_BATCH_LIMIT' USING ERRCODE = '22023';
  END IF;

  FOR target IN
    SELECT subscription.organization_id, subscription.status,
           subscription.access_until
      FROM public.organization_subscriptions subscription
      JOIN public.organizations organization
        ON organization.id = subscription.organization_id
     WHERE subscription.provider = 'kiwify'
       -- Reopening the checkout changes a canceled row back to pending. An
       -- abandoned checkout must not turn paid access into permanent access.
       AND subscription.status IN ('pending', 'past_due', 'canceled')
       AND subscription.access_until IS NOT NULL
       AND subscription.access_until <= _now
       AND organization.commercial_status = 'active'
       AND organization.archived_at IS NULL
     ORDER BY subscription.access_until, subscription.organization_id
     LIMIT _limit
     FOR UPDATE OF subscription SKIP LOCKED
  LOOP
    UPDATE public.organizations
       SET commercial_status = 'suspended',
           updated_at = now()
     WHERE id = target.organization_id
       AND commercial_status = 'active'
       AND archived_at IS NULL;

    IF FOUND THEN
      suspended_count := suspended_count + 1;

      INSERT INTO public.audit_logs(
        organization_id,
        actor_id,
        action,
        entity,
        entity_id,
        metadata
      ) VALUES (
        target.organization_id,
        NULL,
        'billing.subscription_access_expired',
        'organization_subscription',
        target.organization_id,
        jsonb_build_object(
          'provider', 'kiwify',
          'subscription_status', target.status,
          'access_until', target.access_until
        )
      );
    END IF;
  END LOOP;

  RETURN suspended_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.suspend_expired_kiwify_subscriptions(
  timestamptz, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_expired_kiwify_subscriptions(
  timestamptz, integer
) TO postgres;

-- Keep the single cron command stable. Billing expiry becomes one isolated
-- stage of the existing temporal cycle, like the other operational scans.
CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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
  weekly_data_quality_count integer := 0;
  stale_client_count integer := 0;
  client_birthday_count integer := 0;
  stale_lead_count integer := 0;
  stale_task_count integer := 0;
  daily_operational_close_count integer := 0;
  weekly_productivity_report_count integer := 0;
  kiwify_expiry_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    kiwify_expiry_count :=
      public.suspend_expired_kiwify_subscriptions();
  EXCEPTION WHEN OTHERS THEN
    kiwify_expiry_count := -1;
    RAISE WARNING 'KIWIFY_SUBSCRIPTION_EXPIRY_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_productivity_report_count :=
      public.create_weekly_productivity_report_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_productivity_report_count := -1;
    RAISE WARNING 'WEEKLY_PRODUCTIVITY_REPORT_FAILED: %', SQLSTATE;
  END;

  BEGIN
    daily_operational_close_count :=
      public.create_daily_operational_close_notifications();
  EXCEPTION WHEN OTHERS THEN
    daily_operational_close_count := -1;
    RAISE WARNING 'DAILY_OPERATIONAL_CLOSE_FAILED: %', SQLSTATE;
  END;

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
    weekly_data_quality_count :=
      public.create_weekly_data_quality_notifications();
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
    client_birthday_count :=
      public.create_client_birthday_notifications();
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
    overdue_escalation_count :=
      public.create_overdue_task_escalation_notifications();
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
    'kiwify_subscriptions_suspended', kiwify_expiry_count,
    'weekly_productivity_reports_created',
      weekly_productivity_report_count,
    'daily_operational_close_notifications_created',
      daily_operational_close_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_task_notifications_created', stale_task_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created',
      financial_recurrence_count,
    'weekly_financial_summaries_created',
      weekly_financial_summary_count,
    'weekly_data_quality_notifications_created',
      weekly_data_quality_count,
    'stale_client_notifications_created', stale_client_count,
    'client_birthday_notifications_created', client_birthday_count,
    'stale_lead_notifications_created', stale_lead_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
