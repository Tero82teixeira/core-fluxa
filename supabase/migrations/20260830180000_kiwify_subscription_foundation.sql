-- Assinaturas comerciais via Kiwify. O checkout é preparado pelo usuário
-- autenticado, mas somente o service_role do webhook altera a situação paga.

CREATE TABLE public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'kiwify'
    CHECK (provider = 'kiwify'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'refunded', 'chargeback')),
  billing_email text NOT NULL,
  provider_subscription_id text,
  provider_order_id text,
  last_event_type text,
  last_event_at timestamptz,
  checkout_started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (billing_email = lower(btrim(billing_email)))
);

CREATE UNIQUE INDEX organization_subscriptions_provider_subscription_uidx
  ON public.organization_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX organization_subscriptions_status_idx
  ON public.organization_subscriptions(status, updated_at DESC);

ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_subscriptions_read
  ON public.organization_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    public.has_org_membership(organization_id)
    OR public.is_platform_admin()
  );

REVOKE ALL ON TABLE public.organization_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_subscriptions TO authenticated;
GRANT ALL ON TABLE public.organization_subscriptions TO service_role;

-- Guarda somente referências operacionais do evento, sem copiar todo o payload
-- com dados pessoais do comprador. A chave torna reenvios idempotentes.
CREATE TABLE public.kiwify_webhook_events (
  event_key text PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  provider_order_id text,
  provider_subscription_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

ALTER TABLE public.kiwify_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kiwify_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.kiwify_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_kiwify_checkout(_organization uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_email text := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF current_email = '' THEN
    RAISE EXCEPTION 'BILLING_EMAIL_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.organization_members member
      JOIN public.organizations organization ON organization.id = member.organization_id
     WHERE member.organization_id = _organization
       AND member.user_id = auth.uid()
       AND member.is_active
       AND member.role IN ('superadmin', 'proprietario', 'administrador')
       AND organization.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SUBSCRIPTION_MANAGER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organization_subscriptions(
    organization_id,
    provider,
    status,
    billing_email,
    checkout_started_at
  ) VALUES (
    _organization,
    'kiwify',
    'pending',
    current_email,
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET billing_email = EXCLUDED.billing_email,
        status = CASE
          WHEN public.organization_subscriptions.status = 'active'
            THEN public.organization_subscriptions.status
          ELSE 'pending'
        END,
        checkout_started_at = now(),
        updated_at = now();

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    _organization,
    auth.uid(),
    'billing.checkout_started',
    'organization_subscription',
    _organization,
    jsonb_build_object('provider', 'kiwify')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_kiwify_checkout(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_kiwify_checkout(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_kiwify_subscription_event(
  _event_key text,
  _organization uuid,
  _event_type text,
  _subscription_status text,
  _provider_order_id text DEFAULT NULL,
  _provider_subscription_id text DEFAULT NULL,
  _event_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  previous_event_at timestamptz;
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

  SELECT subscription.last_event_at
    INTO previous_event_at
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

  -- Reenvios antigos ficam auditados, mas nunca revertem um evento mais novo.
  IF previous_event_at IS NOT NULL AND _event_at < previous_event_at THEN
    UPDATE public.kiwify_webhook_events
       SET processed_at = now(),
           processing_error = 'STALE_EVENT_IGNORED'
     WHERE event_key = _event_key;
    RETURN false;
  END IF;

  UPDATE public.organization_subscriptions
     SET status = _subscription_status,
         provider_order_id = COALESCE(_provider_order_id, provider_order_id),
         provider_subscription_id = COALESCE(
           _provider_subscription_id,
           provider_subscription_id
         ),
         last_event_type = _event_type,
         last_event_at = _event_at,
         updated_at = now()
   WHERE organization_id = _organization
     AND provider = 'kiwify';

  IF _subscription_status = 'active' THEN
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
      'event_key', _event_key
    )
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_kiwify_subscription_event(
  text, uuid, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_kiwify_subscription_event(
  text, uuid, text, text, text, text, timestamptz
) TO service_role;
