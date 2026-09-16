-- Alertas administrativos para falha e recuperação real das integrações.

BEGIN;

-- A fila continua igual, mas o alerta legado deixa de duplicar o alerta de integração.
CREATE OR REPLACE FUNCTION public.complete_asaas_charge_job(
  _job_id uuid,
  _succeeded boolean,
  _error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  UPDATE public.asaas_charge_jobs
     SET status = CASE WHEN _succeeded THEN 'succeeded' ELSE 'failed' END,
         completed_at = CASE WHEN _succeeded THEN now() ELSE NULL END,
         last_error_code = CASE WHEN _succeeded THEN NULL
           ELSE left(COALESCE(_error_code, 'AUTOMATION_FAILED'), 140) END,
         next_attempt_at = CASE WHEN _succeeded THEN next_attempt_at
           ELSE now() + make_interval(
             mins => least(1440, greatest(5, (power(2, least(attempts, 8))::integer) * 5))
           ) END,
         updated_at = now()
   WHERE id = _job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASAAS_JOB_NOT_FOUND';
  END IF;
END;
$function$;

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
  source_id uuid := (current_row->>'id')::uuid;
  current_status text := current_row->>'status';
  previous_status text := previous_row->>'status';
  was_failure boolean := TG_OP = 'UPDATE' AND previous_status IN ('failed', 'error');
  is_failure boolean := current_status IN ('failed', 'error');
  is_recovery boolean := false;
  should_notify_failure boolean := false;
  integration_key text;
  channel_name text;
  failure_code text;
  notification_title text;
  notification_body text;
  notification_url text;
  notification_key text;
  incident_count integer := 0;
BEGIN
  IF target_organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND was_failure THEN
    is_recovery := CASE TG_TABLE_NAME
      WHEN 'asaas_charge_jobs' THEN current_status = 'succeeded'
      WHEN 'communication_channel_messages' THEN
        current_status IN ('received', 'sent', 'delivered', 'read')
      WHEN 'communication_channel_connections' THEN current_status = 'active'
      ELSE false
    END;
  END IF;

  should_notify_failure := is_failure AND (
    TG_OP = 'INSERT'
    OR NOT was_failure
    OR previous_row->>'last_error_code' IS DISTINCT FROM current_row->>'last_error_code'
    OR previous_row->>'error_code' IS DISTINCT FROM current_row->>'error_code'
    OR previous_row->>'attempts' IS DISTINCT FROM current_row->>'attempts'
  );

  IF NOT should_notify_failure AND NOT is_recovery THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'asaas_charge_jobs' THEN
    integration_key := 'asaas';
    notification_url := '/financeiro';
    IF should_notify_failure THEN
      failure_code := COALESCE(current_row->>'last_error_code', 'ASAAS_OPERATION_FAILED');
      notification_title := 'Falha na cobrança automática';
      notification_body := 'Uma cobrança Asaas precisa de verificação: ' || failure_code;
      notification_key := 'integration:asaas:' || source_id::text || ':failure:' ||
        COALESCE(current_row->>'attempts', '0');
    ELSE
      notification_title := 'Cobrança automática normalizada';
      notification_body := 'A cobrança que havia falhado foi processada com sucesso.';
      notification_key := 'integration:asaas:' || source_id::text || ':recovery:' ||
        COALESCE(current_row->>'attempts', '0');
    END IF;
  ELSIF TG_TABLE_NAME = 'communication_channel_messages' THEN
    SELECT connection.channel::text INTO channel_name
      FROM public.communication_channel_connections connection
     WHERE connection.id = (current_row->>'connection_id')::uuid
       AND connection.organization_id = target_organization_id;
    IF channel_name IS NULL THEN RETURN NEW; END IF;
    integration_key := 'channel-' || channel_name;
    notification_url := '/comunicacao';
    IF should_notify_failure THEN
      failure_code := COALESCE(current_row->>'error_code', 'CHANNEL_DELIVERY_FAILED');
      notification_title := 'Falha no envio ao cliente';
      notification_body := 'Uma mensagem não foi entregue: ' || failure_code;
      notification_key := 'integration:message:' || source_id::text || ':failure';
    ELSE
      notification_title := 'Envio ao cliente normalizado';
      notification_body := 'A mensagem que havia falhado foi entregue com sucesso.';
      notification_key := 'integration:message:' || source_id::text || ':recovery';
    END IF;
  ELSIF TG_TABLE_NAME = 'communication_channel_connections' THEN
    channel_name := current_row->>'channel';
    IF channel_name NOT IN ('whatsapp', 'email') THEN RETURN NEW; END IF;
    integration_key := 'channel-' || channel_name;
    notification_url := '/configuracoes';
    IF should_notify_failure THEN
      failure_code := COALESCE(current_row->>'last_error_code', 'CHANNEL_CONNECTION_ERROR');
      notification_title := 'Integração de comunicação indisponível';
      notification_body := 'O teste da conexão falhou: ' || failure_code;
      notification_key := 'integration:connection:' || source_id::text || ':failure:' ||
        COALESCE(current_row->>'updated_at', 'unknown');
    ELSE
      notification_title := 'Integração de comunicação restabelecida';
      notification_body := CASE channel_name
        WHEN 'whatsapp' THEN 'A conexão do WhatsApp voltou a funcionar.'
        ELSE 'A conexão de e-mail voltou a funcionar.'
      END;
      notification_key := 'integration:connection:' || source_id::text || ':recovery:' ||
        COALESCE(current_row->>'updated_at', 'unknown');
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF should_notify_failure THEN
    UPDATE public.integration_incidents incident
       SET status = 'in_progress', resolved_at = NULL, updated_at = now()
     WHERE incident.organization_id = target_organization_id
       AND incident.integration_key = integration_key
       AND incident.source_failure_id = source_id
       AND incident.status = 'resolved';
    GET DIAGNOSTICS incident_count = ROW_COUNT;
  ELSE
    UPDATE public.integration_incidents incident
       SET status = 'resolved', resolved_at = now(), updated_at = now()
     WHERE incident.organization_id = target_organization_id
       AND incident.integration_key = integration_key
       AND incident.source_failure_id = source_id
       AND incident.status = 'in_progress';
    GET DIAGNOSTICS incident_count = ROW_COUNT;
  END IF;

  IF incident_count > 0 THEN
    INSERT INTO public.audit_logs(
      organization_id, actor_id, action, entity, entity_id, metadata
    ) VALUES (
      target_organization_id, NULL,
      CASE WHEN should_notify_failure
        THEN 'integration_incident_reopened_automatically'
        ELSE 'integration_incident_resolved_automatically' END,
      'integration_incident', source_id,
      jsonb_build_object('integration_key', integration_key, 'source', TG_TABLE_NAME)
    );
  END IF;

  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT target_organization_id, member.user_id, notification_title, notification_body,
         'integration', 'integration', source_id, notification_url,
         notification_key || ':' || member.user_id::text
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

REVOKE ALL ON FUNCTION public.complete_asaas_charge_job(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_asaas_charge_job(uuid, boolean, text)
  TO service_role;

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
