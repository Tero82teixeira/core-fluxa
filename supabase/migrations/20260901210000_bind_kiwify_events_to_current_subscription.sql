-- Keep delayed events from an old Kiwify subscription from changing a newer
-- contract created by the same organization after checkout restart.

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_kiwify_subscription_event(
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
  current_status text;
  current_provider_subscription_id text;
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

  SELECT subscription.last_event_at,
         subscription.access_until,
         subscription.status,
         subscription.provider_subscription_id
    INTO previous_event_at,
         previous_access_until,
         current_status,
         current_provider_subscription_id
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

  -- A pending row represents a newly opened checkout. Its first state-changing
  -- event must be an approval carrying a new Kiwify subscription identifier.
  -- The previous identifier is deliberately retained by checkout preparation
  -- so a delayed approval from the retired contract can be recognized here.
  IF current_status = 'pending'
     AND (
       _subscription_status <> 'active'
       OR _provider_subscription_id IS NULL
       OR (
         current_provider_subscription_id IS NOT NULL
         AND _provider_subscription_id = current_provider_subscription_id
       )
     )
  THEN
    UPDATE public.kiwify_webhook_events
       SET processed_at = now(),
           processing_error = 'PENDING_CHECKOUT_EVENT_IGNORED'
     WHERE event_key = _event_key;
    RETURN false;
  END IF;

  -- Once a contract is bound, only events from that exact subscription may
  -- change it. Kiwify receives HTTP 200 for an ignored retired event, avoiding
  -- retries while keeping the reference available for support diagnostics.
  IF current_status <> 'pending'
     AND current_provider_subscription_id IS NOT NULL
     AND _provider_subscription_id IS NOT NULL
     AND _provider_subscription_id <> current_provider_subscription_id
  THEN
    UPDATE public.kiwify_webhook_events
       SET processed_at = now(),
           processing_error = 'SUBSCRIPTION_ID_MISMATCH_IGNORED'
     WHERE event_key = _event_key;
    RETURN false;
  END IF;

  effective_access_until := COALESCE(_access_until, previous_access_until);

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

COMMIT;
