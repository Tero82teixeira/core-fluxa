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

-- Keep one low-frequency trusted clock. The billing expiry is isolated from
-- the existing operational cycle and cannot stop its execution.
DO $scheduler$
DECLARE
  existing_job record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'SCHEDULER_REQUIRES_POSTGRES';
  END IF;

  IF NOT has_function_privilege(
    'postgres',
    'public.suspend_expired_kiwify_subscriptions(timestamp with time zone,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'KIWIFY_EXPIRY_NOT_EXECUTABLE';
  END IF;

  FOR existing_job IN
    SELECT job.jobid
      FROM cron.job AS job
     WHERE job.jobname = 'core-fluxa-process-due-scheduled-automations'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'core-fluxa-process-due-scheduled-automations',
    '*/15 * * * *',
    'SELECT public.run_temporal_automation_cycle(), public.suspend_expired_kiwify_subscriptions();'
  );
END;
$scheduler$;
