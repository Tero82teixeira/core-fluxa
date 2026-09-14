BEGIN;

CREATE OR REPLACE FUNCTION public.organization_webhook_events(
  _organization_id uuid,
  _limit integer DEFAULT 50
)
RETURNS TABLE(
  event_record_id text,
  provider text,
  event_type text,
  reference text,
  status text,
  diagnostic_code text,
  received_at timestamptz,
  processed_at timestamptz,
  replayable boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN RAISE EXCEPTION 'WEBHOOK_EVENTS_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT event.event_record_id, event.provider, event.event_type, event.reference,
         event.status, event.diagnostic_code, event.received_at, event.processed_at,
         event.replayable
    FROM (
      SELECT webhook.id::text AS event_record_id,
             'asaas'::text AS provider,
             webhook.event_type,
             COALESCE(webhook.provider_payment_id, webhook.event_id)::text AS reference,
             CASE
               WHEN webhook.processed_at IS NULL THEN 'pending'
               WHEN webhook.diagnostic_code IS NOT NULL THEN 'attention'
               ELSE 'processed'
             END::text AS status,
             webhook.diagnostic_code,
             webhook.received_at,
             webhook.processed_at,
             (webhook.diagnostic_code IS NOT NULL AND webhook.provider_payment_id IS NOT NULL)
               AS replayable
        FROM public.asaas_webhook_events webhook
       WHERE webhook.organization_id = _organization_id
      UNION ALL
      SELECT webhook.event_key,
             'kiwify'::text,
             webhook.event_type,
             COALESCE(webhook.provider_subscription_id, webhook.provider_order_id, webhook.event_key),
             CASE
               WHEN webhook.processed_at IS NULL THEN 'pending'
               WHEN webhook.processing_error IS NULL THEN 'processed'
               WHEN right(webhook.processing_error, 8) = '_IGNORED' THEN 'ignored'
               ELSE 'failed'
             END::text,
             webhook.processing_error,
             webhook.received_at,
             webhook.processed_at,
             false
        FROM public.kiwify_webhook_events webhook
       WHERE webhook.organization_id = _organization_id
      UNION ALL
      SELECT message.id::text,
             connection.channel::text,
             'MESSAGE_' || upper(message.status),
             message.external_message_id,
             CASE
               WHEN message.status IN ('received','delivered','read') THEN 'processed'
               WHEN message.status = 'failed' THEN 'failed'
               ELSE 'pending'
             END::text,
             message.error_code,
             message.occurred_at,
             CASE WHEN message.status IN ('received','delivered','read','failed')
               THEN message.occurred_at ELSE NULL END,
             false
        FROM public.communication_channel_messages message
        JOIN public.communication_channel_connections connection
          ON connection.id = message.connection_id
         AND connection.organization_id = message.organization_id
       WHERE message.organization_id = _organization_id
         AND message.direction = 'inbound'
    ) event
   ORDER BY event.received_at DESC
   LIMIT least(greatest(COALESCE(_limit, 50), 1), 200);
END;
$function$;

CREATE OR REPLACE FUNCTION public.organization_integration_credentials(_organization_id uuid)
RETURNS TABLE(
  integration_key text,
  label text,
  status text,
  last_validated_at timestamptz,
  days_since_validation integer,
  diagnostic_code text,
  action_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN RAISE EXCEPTION 'INTEGRATION_CREDENTIALS_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  SELECT 'asaas'::text, 'Asaas'::text,
         CASE
           WHEN connection.id IS NULL OR connection.status = 'disconnected' THEN 'not_configured'
           WHEN connection.status = 'error' OR connection.last_error_code IS NOT NULL THEN 'attention'
           WHEN connection.last_checked_at IS NULL OR connection.last_checked_at < now() - interval '30 days' THEN 'stale'
           ELSE 'healthy'
         END::text,
         connection.last_checked_at,
         CASE WHEN connection.last_checked_at IS NULL THEN NULL
           ELSE floor(extract(epoch FROM (now() - connection.last_checked_at)) / 86400)::integer END,
         CASE
           WHEN connection.status = 'error' THEN COALESCE(connection.last_error_code, 'ASAAS_CONNECTION_ERROR')
           WHEN connection.last_checked_at IS NULL OR connection.last_checked_at < now() - interval '30 days'
             THEN 'CREDENTIAL_VALIDATION_STALE'
           ELSE NULL
         END::text,
         '/configuracoes'::text
    FROM (SELECT 1) seed
    LEFT JOIN public.asaas_connections connection
      ON connection.organization_id = _organization_id;

  RETURN QUERY
  WITH channels(channel_name, channel_label) AS (
    VALUES ('whatsapp'::public.communication_channel, 'WhatsApp'),
           ('email'::public.communication_channel, 'E-mail')
  )
  SELECT ('channel-' || channels.channel_name::text)::text,
         channels.channel_label::text,
         CASE
           WHEN connection.id IS NULL OR NOT connection.is_enabled THEN 'not_configured'
           WHEN connection.status = 'error' OR connection.last_error_code IS NOT NULL THEN 'attention'
           WHEN connection.status <> 'active' OR connection.updated_at < now() - interval '30 days' THEN 'stale'
           ELSE 'healthy'
         END::text,
         GREATEST(connection.last_inbound_at, connection.last_outbound_at, connection.updated_at),
         CASE WHEN connection.updated_at IS NULL THEN NULL
           ELSE floor(extract(epoch FROM (now() - connection.updated_at)) / 86400)::integer END,
         CASE
           WHEN connection.status = 'error' THEN COALESCE(connection.last_error_code, 'CHANNEL_CONNECTION_ERROR')
           WHEN connection.id IS NOT NULL AND (connection.status <> 'active' OR connection.updated_at < now() - interval '30 days')
             THEN 'CREDENTIAL_VALIDATION_STALE'
           ELSE NULL
         END::text,
         '/configuracoes'::text
    FROM channels
    LEFT JOIN public.communication_channel_connections connection
      ON connection.organization_id = _organization_id
     AND connection.channel = channels.channel_name;

  RETURN QUERY
  SELECT 'push'::text, 'Notificações push'::text,
         CASE WHEN count(*) FILTER (WHERE subscription.is_active) > 0
           THEN 'healthy' ELSE 'not_configured' END::text,
         max(subscription.last_used_at),
         CASE WHEN max(subscription.last_used_at) IS NULL THEN NULL
           ELSE floor(extract(epoch FROM (now() - max(subscription.last_used_at))) / 86400)::integer END,
         CASE WHEN count(*) FILTER (WHERE subscription.is_active) = 0
           THEN 'PUSH_NO_ACTIVE_DEVICE' ELSE NULL END::text,
         '/notificacoes'::text
    FROM public.push_subscriptions subscription
   WHERE subscription.organization_id = _organization_id;

  RETURN QUERY
  SELECT 'copilot'::text, 'Copiloto com IA'::text,
         CASE WHEN COALESCE(settings.communication_ai_enabled, false)
           THEN 'stale' ELSE 'not_configured' END::text,
         NULL::timestamptz, NULL::integer,
         CASE WHEN COALESCE(settings.communication_ai_enabled, false)
           THEN 'CREDENTIAL_TEST_RECOMMENDED' ELSE 'COPILOT_NOT_CONFIGURED' END::text,
         '/configuracoes'::text
    FROM (SELECT 1) seed
    LEFT JOIN public.organization_settings settings
      ON settings.organization_id = _organization_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.organization_integration_report(
  _organization_id uuid,
  _from timestamptz DEFAULT now() - interval '30 days',
  _to timestamptz DEFAULT now()
)
RETURNS TABLE(
  provider text,
  label text,
  total_count integer,
  processed_count integer,
  warning_count integer,
  failed_count integer,
  success_rate numeric,
  last_event_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN RAISE EXCEPTION 'INTEGRATION_REPORT_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF _from IS NULL OR _to IS NULL OR _from >= _to OR _to - _from > interval '366 days' THEN
    RAISE EXCEPTION 'INTEGRATION_REPORT_PERIOD_INVALID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH events AS (
    SELECT 'asaas'::text AS provider, 'Asaas'::text AS label,
           (webhook.processed_at IS NOT NULL AND webhook.diagnostic_code IS NULL) AS processed,
           (webhook.diagnostic_code IS NOT NULL) AS warning,
           false AS failed,
           webhook.received_at AS event_at
      FROM public.asaas_webhook_events webhook
     WHERE webhook.organization_id = _organization_id
       AND webhook.received_at >= _from AND webhook.received_at < _to
    UNION ALL
    SELECT 'kiwify', 'Kiwify',
           (webhook.processed_at IS NOT NULL AND webhook.processing_error IS NULL),
           (webhook.processing_error IS NOT NULL AND right(webhook.processing_error, 8) = '_IGNORED'),
           (webhook.processing_error IS NOT NULL AND right(webhook.processing_error, 8) <> '_IGNORED'),
           webhook.received_at
      FROM public.kiwify_webhook_events webhook
     WHERE webhook.organization_id = _organization_id
       AND webhook.received_at >= _from AND webhook.received_at < _to
    UNION ALL
    SELECT connection.channel::text,
           CASE connection.channel WHEN 'whatsapp' THEN 'WhatsApp' ELSE 'E-mail' END,
           (message.status IN ('received','delivered','read')),
           (message.status = 'pending_match'),
           (message.status = 'failed'),
           message.occurred_at
      FROM public.communication_channel_messages message
      JOIN public.communication_channel_connections connection
        ON connection.id = message.connection_id
       AND connection.organization_id = message.organization_id
     WHERE message.organization_id = _organization_id
       AND message.direction = 'inbound'
       AND message.occurred_at >= _from AND message.occurred_at < _to
  ), providers(provider, label) AS (
    VALUES ('asaas'::text, 'Asaas'::text), ('kiwify', 'Kiwify'),
           ('whatsapp', 'WhatsApp'), ('email', 'E-mail')
  )
  SELECT providers.provider, providers.label,
         count(events.event_at)::integer,
         count(*) FILTER (WHERE events.processed)::integer,
         count(*) FILTER (WHERE events.warning)::integer,
         count(*) FILTER (WHERE events.failed)::integer,
         CASE WHEN count(events.event_at) = 0 THEN 0::numeric
           ELSE round(100 * count(*) FILTER (WHERE events.processed)::numeric /
             count(events.event_at), 1) END,
         max(events.event_at)
    FROM providers
    LEFT JOIN events ON events.provider = providers.provider
   GROUP BY providers.provider, providers.label
   ORDER BY providers.label;
END;
$function$;

REVOKE ALL ON FUNCTION public.organization_webhook_events(uuid, integer),
  public.organization_integration_credentials(uuid),
  public.organization_integration_report(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_webhook_events(uuid, integer),
  public.organization_integration_credentials(uuid),
  public.organization_integration_report(uuid, timestamptz, timestamptz)
  TO authenticated;

COMMIT;