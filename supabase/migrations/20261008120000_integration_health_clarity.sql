-- Clareza do diagnóstico, validação real do Copiloto e nova versão observável.

BEGIN;

CREATE OR REPLACE FUNCTION public.organization_integration_health(_organization_id uuid)
RETURNS TABLE(
  integration_key text,
  label text,
  category text,
  status text,
  expected_version text,
  reported_version text,
  last_activity_at timestamptz,
  pending_count integer,
  error_count integer,
  last_error_code text,
  action_url text,
  action_label text
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
  ) THEN
    RAISE EXCEPTION 'INTEGRATION_HEALTH_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH expected(function_name, function_label) AS (
    VALUES
      ('asaas-billing-automation', 'Automação de cobranças Asaas'),
      ('asaas-connector', 'Conector Asaas'),
      ('asaas-webhook', 'Webhook Asaas'),
      ('communication-channel-send', 'Envio WhatsApp e e-mail'),
      ('communication-channel-webhook', 'Recebimento WhatsApp e e-mail'),
      ('communication-push', 'Notificações push'),
      ('kiwify-webhook', 'Webhook Kiwify')
  )
  SELECT expected.function_name::text,
         expected.function_label::text,
         'implantacao'::text,
         CASE
           WHEN heartbeat.function_name IS NULL THEN 'not_reported'
           WHEN heartbeat.release_version <> '2026.10.08.1' THEN 'outdated'
           ELSE 'healthy'
         END::text,
         '2026.10.08.1'::text,
         heartbeat.release_version,
         heartbeat.last_seen_at,
         0::integer,
         CASE
           WHEN heartbeat.function_name IS NULL OR heartbeat.release_version <> '2026.10.08.1'
             THEN 1
           ELSE 0
         END::integer,
         CASE
           WHEN heartbeat.function_name IS NULL THEN 'FUNCTION_VERSION_NOT_REPORTED'
           WHEN heartbeat.release_version <> '2026.10.08.1' THEN 'FUNCTION_VERSION_OUTDATED'
           ELSE NULL
         END::text,
         '/configuracoes'::text,
         'Ver orientação'::text
    FROM expected
    LEFT JOIN public.integration_runtime_heartbeats heartbeat
      ON heartbeat.function_name = expected.function_name;

  RETURN QUERY
  SELECT 'asaas'::text,
         'Asaas'::text,
         'servico'::text,
         CASE
           WHEN NOT EXISTS (
             SELECT 1 FROM public.asaas_connections connection
              WHERE connection.organization_id = _organization_id
                AND connection.status = 'connected'
           ) THEN 'not_configured'
           WHEN EXISTS (
             SELECT 1 FROM public.asaas_charge_jobs job
              WHERE job.organization_id = _organization_id AND job.status = 'failed'
           ) OR EXISTS (
             SELECT 1 FROM public.asaas_connections connection
              WHERE connection.organization_id = _organization_id
                AND connection.last_error_code IS NOT NULL
           ) THEN 'attention'
           ELSE 'healthy'
         END::text,
         NULL::text,
         NULL::text,
         GREATEST(
           (SELECT max(connection.last_checked_at) FROM public.asaas_connections connection
             WHERE connection.organization_id = _organization_id),
           (SELECT max(job.last_attempt_at) FROM public.asaas_charge_jobs job
             WHERE job.organization_id = _organization_id)
         ),
         (SELECT count(*)::integer FROM public.asaas_charge_jobs job
           WHERE job.organization_id = _organization_id AND job.status IN ('pending','processing')),
         (SELECT count(*)::integer FROM public.asaas_charge_jobs job
           WHERE job.organization_id = _organization_id AND job.status = 'failed'),
         COALESCE(
           (SELECT job.last_error_code FROM public.asaas_charge_jobs job
             WHERE job.organization_id = _organization_id AND job.last_error_code IS NOT NULL
             ORDER BY job.updated_at DESC LIMIT 1),
           (SELECT connection.last_error_code FROM public.asaas_connections connection
             WHERE connection.organization_id = _organization_id
               AND connection.last_error_code IS NOT NULL
             ORDER BY connection.updated_at DESC LIMIT 1)
         ),
         '/financeiro'::text,
         'Abrir cobranças'::text;

  RETURN QUERY
  WITH channels(channel_name, channel_label) AS (
    VALUES ('whatsapp'::public.communication_channel, 'WhatsApp'),
           ('email'::public.communication_channel, 'E-mail')
  )
  SELECT ('channel-' || channels.channel_name::text)::text,
         channels.channel_label::text,
         'servico'::text,
         CASE
           WHEN connection.id IS NULL OR NOT connection.is_enabled THEN 'not_configured'
           WHEN connection.status = 'error' OR connection.last_error_code IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM public.communication_channel_messages message
                WHERE message.organization_id = _organization_id
                  AND message.connection_id = connection.id
                  AND message.status = 'failed'
             ) THEN 'attention'
           WHEN connection.status = 'active' THEN 'healthy'
           ELSE 'pending'
         END::text,
         NULL::text,
         NULL::text,
         GREATEST(connection.last_inbound_at, connection.last_outbound_at),
         (SELECT count(*)::integer FROM public.communication_channel_messages message
           WHERE message.organization_id = _organization_id
             AND message.connection_id = connection.id
             AND message.status = 'pending_match'),
         (SELECT count(*)::integer FROM public.communication_channel_messages message
           WHERE message.organization_id = _organization_id
             AND message.connection_id = connection.id
             AND message.status = 'failed'),
         COALESCE(
           connection.last_error_code,
           (SELECT message.error_code FROM public.communication_channel_messages message
             WHERE message.organization_id = _organization_id
               AND message.connection_id = connection.id
               AND message.error_code IS NOT NULL
             ORDER BY message.occurred_at DESC LIMIT 1)
         ),
         '/configuracoes'::text,
         'Configurar comunicação'::text
    FROM channels
    LEFT JOIN public.communication_channel_connections connection
      ON connection.organization_id = _organization_id
     AND connection.channel = channels.channel_name;

  RETURN QUERY
  SELECT 'push'::text,
         'Notificações no celular'::text,
         'servico'::text,
         CASE WHEN count(*) FILTER (WHERE subscription.is_active) > 0
           THEN 'healthy' ELSE 'not_configured' END::text,
         NULL::text,
         NULL::text,
         max(subscription.last_used_at),
         0::integer,
         0::integer,
         NULL::text,
         '/notificacoes'::text,
         'Configurar aparelhos'::text
    FROM public.push_subscriptions subscription
   WHERE subscription.organization_id = _organization_id;

  RETURN QUERY
  SELECT 'copilot'::text,
         'Copiloto com IA'::text,
         'servico'::text,
         CASE WHEN COALESCE(settings.communication_ai_enabled, false)
           THEN 'healthy' ELSE 'not_configured' END::text,
         NULL::text,
         NULL::text,
         settings.updated_at,
         0::integer,
         0::integer,
         NULL::text,
         '/configuracoes'::text,
         'Configurar IA'::text
    FROM (SELECT 1) seed
    LEFT JOIN public.organization_settings settings
      ON settings.organization_id = _organization_id;

  RETURN QUERY
  SELECT 'kiwify'::text,
         'Assinatura Kiwify'::text,
         'servico'::text,
         CASE
           WHEN subscription.organization_id IS NULL THEN 'not_configured'
           WHEN subscription.status = 'active' THEN 'healthy'
           WHEN subscription.status = 'pending' THEN 'pending'
           ELSE 'attention'
         END::text,
         NULL::text,
         NULL::text,
         subscription.last_event_at,
         CASE WHEN subscription.status = 'pending' THEN 1 ELSE 0 END::integer,
         CASE WHEN subscription.status IN ('past_due','canceled','refunded','chargeback')
           THEN 1 ELSE 0 END::integer,
         CASE WHEN subscription.status IN ('past_due','canceled','refunded','chargeback')
           THEN upper(subscription.status) ELSE NULL END::text,
         '/assinatura'::text,
         'Abrir assinatura'::text
    FROM (SELECT 1) seed
    LEFT JOIN public.organization_subscriptions subscription
      ON subscription.organization_id = _organization_id;
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
         CASE
           WHEN NOT COALESCE(settings.communication_ai_enabled, false) THEN 'not_configured'
           WHEN settings.updated_at IS NULL
             OR settings.updated_at < now() - interval '30 days' THEN 'stale'
           ELSE 'healthy'
         END::text,
         settings.updated_at,
         CASE WHEN settings.updated_at IS NULL THEN NULL
           ELSE floor(extract(epoch FROM (now() - settings.updated_at)) / 86400)::integer END,
         CASE
           WHEN NOT COALESCE(settings.communication_ai_enabled, false) THEN 'COPILOT_NOT_CONFIGURED'
           WHEN settings.updated_at IS NULL
             OR settings.updated_at < now() - interval '30 days'
             THEN 'CREDENTIAL_TEST_RECOMMENDED'
           ELSE NULL
         END::text,
         '/configuracoes'::text
    FROM (SELECT 1) seed
    LEFT JOIN public.organization_settings settings
      ON settings.organization_id = _organization_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.organization_integration_health(uuid),
  public.organization_integration_credentials(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_integration_health(uuid),
  public.organization_integration_credentials(uuid)
  TO authenticated;

COMMIT;
