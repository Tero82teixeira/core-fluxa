-- Operação diária das integrações: relatório considera entrada e saída dos canais.

BEGIN;

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
  ) THEN
    RAISE EXCEPTION 'INTEGRATION_REPORT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
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
           (message.status IN ('received','sent','delivered','read')),
           (message.status = 'pending_match'),
           (message.status = 'failed'),
           message.occurred_at
      FROM public.communication_channel_messages message
      JOIN public.communication_channel_connections connection
        ON connection.id = message.connection_id
       AND connection.organization_id = message.organization_id
     WHERE message.organization_id = _organization_id
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

REVOKE ALL ON FUNCTION public.organization_integration_report(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_integration_report(uuid, timestamptz, timestamptz)
  TO authenticated;

COMMIT;
