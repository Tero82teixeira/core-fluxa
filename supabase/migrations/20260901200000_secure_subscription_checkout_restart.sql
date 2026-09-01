-- Prevent a new checkout attempt from corrupting an active subscription,
-- charging again during paid/grace access or stealing a recent pending
-- checkout from another subscription manager.

BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_kiwify_checkout(_organization uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_email text := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
  existing_status text;
  existing_email text;
  existing_access_until timestamptz;
  existing_checkout_started_at timestamptz;
  subscription_found boolean := false;
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

  SELECT subscription.status,
         subscription.billing_email,
         subscription.access_until,
         subscription.checkout_started_at
    INTO existing_status,
         existing_email,
         existing_access_until,
         existing_checkout_started_at
    FROM public.organization_subscriptions subscription
   WHERE subscription.organization_id = _organization
     AND subscription.provider = 'kiwify'
   FOR UPDATE;
  subscription_found := FOUND;

  IF subscription_found AND existing_status = 'active' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_ALREADY_ACTIVE' USING ERRCODE = '55000';
  END IF;
  IF subscription_found
     AND (
       (
         existing_status = 'past_due'
         AND (
           existing_access_until IS NULL
           OR existing_access_until > now()
         )
       )
       OR (
         existing_status = 'canceled'
         AND existing_access_until IS NOT NULL
         AND existing_access_until > now()
       )
     )
  THEN
    RAISE EXCEPTION 'CHECKOUT_PAID_ACCESS_STILL_ACTIVE' USING ERRCODE = '55000';
  END IF;
  IF subscription_found
     AND existing_status = 'pending'
     AND lower(existing_email) <> current_email
     AND existing_checkout_started_at IS NOT NULL
     AND existing_checkout_started_at > now() - interval '30 minutes'
  THEN
    RAISE EXCEPTION 'CHECKOUT_ALREADY_IN_PROGRESS' USING ERRCODE = '55000';
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
        status = 'pending',
        checkout_started_at = now(),
        updated_at = now();

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization,
    auth.uid(),
    'billing.checkout_started',
    'organization_subscription',
    _organization,
    jsonb_build_object(
      'provider', 'kiwify',
      'previous_status', existing_status,
      'resumed', subscription_found
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_kiwify_checkout(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_kiwify_checkout(uuid)
  TO authenticated;

COMMIT;
