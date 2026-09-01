-- Record actionable Kiwify failures that happen before subscription processing
-- and notify platform administrators without persisting buyer personal data.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_kiwify_webhook_failure(
  _event_key text,
  _event_type text,
  _diagnostic_code text,
  _organization uuid DEFAULT NULL,
  _provider_order_id text DEFAULT NULL,
  _provider_subscription_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  failure_key text;
  effective_organization uuid;
  company_name text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _event_key IS NULL OR length(btrim(_event_key)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_KIWIFY_EVENT_KEY' USING ERRCODE = '22023';
  END IF;
  IF _event_type IS NULL OR length(btrim(_event_type)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'INVALID_KIWIFY_EVENT_TYPE' USING ERRCODE = '22023';
  END IF;
  IF _diagnostic_code NOT IN (
    'ORGANIZATION_TRACKING_REQUIRED',
    'PREPARED_CHECK_FAILED',
    'CHECKOUT_NOT_PREPARED',
    'BILLING_EMAIL_MISMATCH',
    'EVENT_PROCESSING_FAILED'
  ) THEN
    RAISE EXCEPTION 'INVALID_KIWIFY_DIAGNOSTIC' USING ERRCODE = '22023';
  END IF;

  SELECT organization.id,
         COALESCE(organization.trade_name, organization.legal_name)
    INTO effective_organization, company_name
    FROM public.organizations organization
   WHERE organization.id = _organization;

  failure_key := 'failure:' || btrim(_event_key);

  INSERT INTO public.kiwify_webhook_events(
    event_key,
    organization_id,
    event_type,
    provider_order_id,
    provider_subscription_id,
    processing_error
  ) VALUES (
    failure_key,
    effective_organization,
    btrim(_event_type),
    NULLIF(btrim(_provider_order_id), ''),
    NULLIF(btrim(_provider_subscription_id), ''),
    _diagnostic_code
  )
  ON CONFLICT (event_key) DO UPDATE
     SET organization_id = COALESCE(
           public.kiwify_webhook_events.organization_id,
           EXCLUDED.organization_id
         ),
         processing_error = EXCLUDED.processing_error
   WHERE public.kiwify_webhook_events.processed_at IS NULL;

  INSERT INTO public.notifications(
    organization_id,
    user_id,
    title,
    body,
    kind,
    action_url,
    entity_type,
    dedupe_key
  )
  SELECT DISTINCT member.organization_id,
         administrator.user_id,
         'Falha no pagamento Kiwify',
         format(
           '%s · %s. Abra a administração da plataforma para verificar.',
           COALESCE(company_name, 'Empresa não identificada'),
           replace(btrim(_event_type), '_', ' ')
         ),
         'system',
         '/administracao-plataforma',
         'kiwify_webhook_event',
         'kiwify-failure:' || md5(btrim(_event_key))
    FROM public.platform_admins administrator
    JOIN public.organization_members member
      ON member.user_id = administrator.user_id
     AND member.is_active
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_kiwify_webhook_failure(_event_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  failure public.kiwify_webhook_events%ROWTYPE;
  company_name text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _event_key IS NULL OR length(btrim(_event_key)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_KIWIFY_EVENT_KEY' USING ERRCODE = '22023';
  END IF;

  UPDATE public.kiwify_webhook_events event
     SET processed_at = now(),
         processing_error = 'RETRY_SUCCEEDED_IGNORED'
   WHERE event.event_key = 'failure:' || btrim(_event_key)
     AND event.processed_at IS NULL
  RETURNING event.* INTO failure;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(organization.trade_name, organization.legal_name)
    INTO company_name
    FROM public.organizations organization
   WHERE organization.id = failure.organization_id;

  INSERT INTO public.notifications(
    organization_id,
    user_id,
    title,
    body,
    kind,
    action_url,
    entity_type,
    dedupe_key
  )
  SELECT DISTINCT member.organization_id,
         administrator.user_id,
         'Evento Kiwify recuperado',
         format(
           '%s · a nova tentativa foi processada com segurança.',
           COALESCE(company_name, 'Empresa não identificada')
         ),
         'system',
         '/administracao-plataforma',
         'kiwify_webhook_event',
         'kiwify-recovered:' || md5(btrim(_event_key))
    FROM public.platform_admins administrator
    JOIN public.organization_members member
      ON member.user_id = administrator.user_id
     AND member.is_active
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_kiwify_webhook_failure(
  text, text, text, uuid, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_kiwify_webhook_failure(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_kiwify_webhook_failure(
  text, text, text, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_kiwify_webhook_failure(text)
  TO service_role;

COMMIT;
