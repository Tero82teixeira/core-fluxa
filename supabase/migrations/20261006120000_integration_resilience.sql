-- Diagnóstico acionável, fila de falhas e alertas administrativos das integrações.

BEGIN;

CREATE TABLE IF NOT EXISTS public.integration_alert_push_claims (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, subscription_id)
);

ALTER TABLE public.integration_alert_push_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_alert_push_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_alert_push_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_integration_alert_push_deliveries(
  _limit integer DEFAULT 100
)
RETURNS TABLE(
  notification_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  title text,
  body text,
  action_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH candidate AS (
    SELECT notification.id AS notification_id, subscription.id AS subscription_id,
           subscription.endpoint, subscription.p256dh, subscription.auth_key,
           notification.title, COALESCE(notification.body, '') AS body,
           COALESCE(notification.action_url, '/configuracoes') AS action_url
      FROM public.notifications notification
      JOIN public.push_subscriptions subscription
        ON subscription.organization_id = notification.organization_id
       AND subscription.user_id = notification.user_id
       AND subscription.is_active
     WHERE notification.kind = 'integration'
       AND notification.created_at >= now() - interval '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM public.integration_alert_push_claims claim
          WHERE claim.notification_id = notification.id
            AND claim.subscription_id = subscription.id
       )
     ORDER BY notification.created_at
     LIMIT least(greatest(_limit, 1), 500)
  ), claimed AS (
    INSERT INTO public.integration_alert_push_claims(notification_id, subscription_id)
    SELECT notification_id, subscription_id FROM candidate
    ON CONFLICT DO NOTHING
    RETURNING notification_id, subscription_id
  )
  SELECT candidate.notification_id, candidate.subscription_id, candidate.endpoint,
         candidate.p256dh, candidate.auth_key, candidate.title, candidate.body,
         candidate.action_url
    FROM candidate
    JOIN claimed USING (notification_id, subscription_id)
$function$;

REVOKE ALL ON FUNCTION public.claim_integration_alert_push_deliveries(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_alert_push_deliveries(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.organization_integration_failures(_organization_id uuid)
RETURNS TABLE(
  failure_id uuid,
  integration_key text,
  label text,
  description text,
  error_code text,
  failed_at timestamptz,
  attempts integer,
  retryable boolean
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
    RAISE EXCEPTION 'INTEGRATION_FAILURES_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT failure.failure_id, failure.integration_key, failure.label,
         failure.description, failure.error_code, failure.failed_at,
         failure.attempts, failure.retryable
    FROM (
      SELECT job.id AS failure_id,
             'asaas'::text AS integration_key,
             'Cobrança automática Asaas'::text AS label,
             COALESCE(transaction.description, 'Cobrança sem descrição')::text AS description,
             COALESCE(job.last_error_code, 'ASAAS_OPERATION_FAILED')::text AS error_code,
             COALESCE(job.last_attempt_at, job.updated_at)::timestamptz AS failed_at,
             job.attempts::integer AS attempts,
             true AS retryable
        FROM public.asaas_charge_jobs job
        JOIN public.financial_transactions transaction
          ON transaction.id = job.transaction_id
         AND transaction.organization_id = job.organization_id
       WHERE job.organization_id = _organization_id
         AND job.status = 'failed'
      UNION ALL
      SELECT message.id,
             ('channel-' || connection.channel::text)::text,
             CASE connection.channel
               WHEN 'whatsapp' THEN 'Envio pelo WhatsApp'
               ELSE 'Envio por e-mail'
             END::text,
             left(message.content, 180)::text,
             COALESCE(message.error_code, 'CHANNEL_DELIVERY_FAILED')::text,
             message.occurred_at,
             1,
             false
        FROM public.communication_channel_messages message
        JOIN public.communication_channel_connections connection
          ON connection.id = message.connection_id
         AND connection.organization_id = message.organization_id
       WHERE message.organization_id = _organization_id
         AND message.status = 'failed'
      UNION ALL
      SELECT connection.id,
             ('channel-' || connection.channel::text)::text,
             CASE connection.channel
               WHEN 'whatsapp' THEN 'Conexão do WhatsApp'
               ELSE 'Conexão de e-mail'
             END::text,
             'O teste de conexão do provedor falhou.'::text,
             COALESCE(connection.last_error_code, 'CHANNEL_CONNECTION_ERROR')::text,
             connection.updated_at,
             1,
             false
        FROM public.communication_channel_connections connection
       WHERE connection.organization_id = _organization_id
         AND connection.status = 'error'
    ) failure
   ORDER BY failure.failed_at DESC
   LIMIT 20;
END;
$function$;

REVOKE ALL ON FUNCTION public.organization_integration_failures(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_integration_failures(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_integration_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  current_row jsonb := to_jsonb(NEW);
  previous_row jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  target_organization_id uuid := (current_row->>'organization_id')::uuid;
  failure_code text;
  notification_title text;
  notification_body text;
  notification_url text;
  notification_key text;
BEGIN
  IF current_row->>'status' <> 'failed' AND current_row->>'status' <> 'error' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND previous_row->>'status' = current_row->>'status'
     AND previous_row->>'last_error_code' IS NOT DISTINCT FROM current_row->>'last_error_code'
     AND previous_row->>'error_code' IS NOT DISTINCT FROM current_row->>'error_code'
     AND previous_row->>'attempts' IS NOT DISTINCT FROM current_row->>'attempts' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'asaas_charge_jobs' THEN
    failure_code := COALESCE(current_row->>'last_error_code', 'ASAAS_OPERATION_FAILED');
    notification_title := 'Falha na cobrança automática';
    notification_body := 'Uma cobrança Asaas precisa de verificação: ' || failure_code;
    notification_url := '/financeiro';
    notification_key := 'integration:asaas:' || (current_row->>'id') || ':' ||
      COALESCE(current_row->>'attempts', '0');
  ELSIF TG_TABLE_NAME = 'communication_channel_messages' THEN
    failure_code := COALESCE(current_row->>'error_code', 'CHANNEL_DELIVERY_FAILED');
    notification_title := 'Falha no envio ao cliente';
    notification_body := 'Uma mensagem não foi entregue: ' || failure_code;
    notification_url := '/comunicacao';
    notification_key := 'integration:message:' || (current_row->>'id');
  ELSE
    failure_code := COALESCE(current_row->>'last_error_code', 'CHANNEL_CONNECTION_ERROR');
    notification_title := 'Integração de comunicação indisponível';
    notification_body := 'O teste da conexão falhou: ' || failure_code;
    notification_url := '/configuracoes';
    notification_key := 'integration:connection:' || (current_row->>'id') || ':' || failure_code;
  END IF;

  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT target_organization_id, member.user_id, notification_title, notification_body,
         'integration', 'integration', (current_row->>'id')::uuid,
         notification_url, notification_key || ':' || member.user_id::text
    FROM public.organization_members member
   WHERE member.organization_id = target_organization_id
     AND member.is_active
     AND member.role = ANY(
       ARRAY['superadmin','proprietario','administrador']::public.app_role[]
     )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_integration_failure()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS notify_asaas_charge_job_failure ON public.asaas_charge_jobs;
CREATE TRIGGER notify_asaas_charge_job_failure
AFTER INSERT OR UPDATE ON public.asaas_charge_jobs
FOR EACH ROW EXECUTE FUNCTION public.notify_integration_failure();

DROP TRIGGER IF EXISTS notify_channel_message_failure ON public.communication_channel_messages;
CREATE TRIGGER notify_channel_message_failure
AFTER INSERT OR UPDATE ON public.communication_channel_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_integration_failure();

DROP TRIGGER IF EXISTS notify_channel_connection_failure ON public.communication_channel_connections;
CREATE TRIGGER notify_channel_connection_failure
AFTER INSERT OR UPDATE ON public.communication_channel_connections
FOR EACH ROW EXECUTE FUNCTION public.notify_integration_failure();

COMMIT;
