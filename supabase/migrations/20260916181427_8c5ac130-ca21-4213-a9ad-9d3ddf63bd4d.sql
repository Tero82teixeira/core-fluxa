-- 20261010120000_integration_support_diagnostics.sql
CREATE OR REPLACE FUNCTION public.organization_asaas_automation_status(
  _organization_id uuid
)
RETURNS TABLE(
  last_run_at timestamptz,
  processed_count integer,
  succeeded_count integer,
  failed_count integer,
  queued_count integer,
  next_attempt_at timestamptz
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
    RAISE EXCEPTION 'ASAAS_AUTOMATION_STATUS_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT max(job.last_attempt_at) AS last_run_at
      FROM public.asaas_charge_jobs job
     WHERE job.organization_id = _organization_id
  ), last_cycle AS (
    SELECT job.status
      FROM public.asaas_charge_jobs job
      CROSS JOIN latest
     WHERE job.organization_id = _organization_id
       AND latest.last_run_at IS NOT NULL
       AND job.last_attempt_at >= latest.last_run_at - interval '5 minutes'
       AND job.last_attempt_at <= latest.last_run_at
  ), queue AS (
    SELECT count(*)::integer AS queued_count,
           min(job.next_attempt_at) AS next_attempt_at
      FROM public.asaas_charge_jobs job
     WHERE job.organization_id = _organization_id
       AND job.status IN ('pending','processing')
  )
  SELECT latest.last_run_at,
         count(last_cycle.status)::integer,
         count(*) FILTER (WHERE last_cycle.status = 'succeeded')::integer,
         count(*) FILTER (WHERE last_cycle.status = 'failed')::integer,
         queue.queued_count,
         queue.next_attempt_at
    FROM latest
    CROSS JOIN queue
    LEFT JOIN last_cycle ON true
   GROUP BY latest.last_run_at, queue.queued_count, queue.next_attempt_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.organization_asaas_automation_status(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_asaas_automation_status(uuid)
  TO authenticated;

-- 20261011120000_integration_incident_ownership.sql
CREATE TABLE IF NOT EXISTS public.integration_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  source_failure_id uuid NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  error_code text NOT NULL,
  failed_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  retryable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'resolved')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, integration_key, source_failure_id),
  CHECK (char_length(integration_key) BETWEEN 1 AND 80),
  CHECK (char_length(label) BETWEEN 1 AND 160),
  CHECK (char_length(description) BETWEEN 1 AND 500),
  CHECK (char_length(error_code) BETWEEN 1 AND 160),
  CHECK (attempts >= 0),
  CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status = 'in_progress' AND resolved_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS integration_incidents_org_status_idx
  ON public.integration_incidents(organization_id, status, updated_at DESC);

ALTER TABLE public.integration_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.integration_incidents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.integration_incidents TO service_role;

CREATE OR REPLACE FUNCTION public.organization_integration_incidents(
  _organization_id uuid
)
RETURNS TABLE(
  incident_id uuid,
  failure_id uuid,
  integration_key text,
  label text,
  description text,
  error_code text,
  failed_at timestamptz,
  attempts integer,
  retryable boolean,
  status text,
  assigned_to uuid,
  assigned_name text,
  updated_at timestamptz,
  is_active_failure boolean
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
    RAISE EXCEPTION 'INTEGRATION_INCIDENTS_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH active_failure AS (
    SELECT * FROM public.organization_integration_failures(_organization_id)
  ), tracked AS (
    SELECT incident.*
      FROM public.integration_incidents incident
     WHERE incident.organization_id = _organization_id
  ), combined AS (
    SELECT tracked.id AS incident_id,
           COALESCE(active_failure.failure_id, tracked.source_failure_id) AS failure_id,
           COALESCE(active_failure.integration_key, tracked.integration_key) AS integration_key,
           COALESCE(active_failure.label, tracked.label) AS label,
           COALESCE(active_failure.description, tracked.description) AS description,
           COALESCE(active_failure.error_code, tracked.error_code) AS error_code,
           COALESCE(active_failure.failed_at, tracked.failed_at) AS failed_at,
           COALESCE(active_failure.attempts, tracked.attempts) AS attempts,
           COALESCE(active_failure.retryable, tracked.retryable) AS retryable,
           COALESCE(tracked.status, 'open') AS status,
           tracked.assigned_to,
           COALESCE(tracked.updated_at, active_failure.failed_at) AS updated_at,
           (active_failure.failure_id IS NOT NULL) AS is_active_failure
      FROM active_failure
      FULL JOIN tracked
        ON tracked.source_failure_id = active_failure.failure_id
       AND tracked.integration_key = active_failure.integration_key
  )
  SELECT combined.incident_id, combined.failure_id, combined.integration_key,
         combined.label, combined.description, combined.error_code,
         combined.failed_at, combined.attempts, combined.retryable,
         combined.status, combined.assigned_to,
         COALESCE(profile.full_name, profile.email)::text AS assigned_name,
         combined.updated_at, combined.is_active_failure
    FROM combined
    LEFT JOIN public.profiles profile ON profile.id = combined.assigned_to
   ORDER BY
     CASE combined.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
     combined.failed_at DESC
   LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.manage_integration_incident(
  _organization_id uuid,
  _integration_key text,
  _failure_id uuid,
  _action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  failure_record record;
  existing_incident public.integration_incidents%ROWTYPE;
  next_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'INTEGRATION_INCIDENT_MANAGE_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('acknowledge', 'resolve', 'reopen') THEN
    RAISE EXCEPTION 'INTEGRATION_INCIDENT_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _organization_id::text || ':' || _integration_key || ':' || _failure_id::text,
    0
  ));

  SELECT * INTO failure_record
    FROM public.organization_integration_failures(_organization_id) failure
   WHERE failure.integration_key = _integration_key
     AND failure.failure_id = _failure_id;

  SELECT * INTO existing_incident
    FROM public.integration_incidents incident
   WHERE incident.organization_id = _organization_id
     AND incident.integration_key = _integration_key
     AND incident.source_failure_id = _failure_id
   FOR UPDATE;

  IF failure_record.failure_id IS NULL AND existing_incident.id IS NULL THEN
    RAISE EXCEPTION 'INTEGRATION_INCIDENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  next_status := CASE WHEN _action = 'resolve' THEN 'resolved' ELSE 'in_progress' END;

  IF existing_incident.id IS NULL THEN
    INSERT INTO public.integration_incidents(
      organization_id, integration_key, source_failure_id, label, description,
      error_code, failed_at, attempts, retryable, status, assigned_to, resolved_at
    ) VALUES (
      _organization_id, failure_record.integration_key, failure_record.failure_id,
      left(failure_record.label, 160),
      left(COALESCE(NULLIF(btrim(failure_record.description), ''),
        'Ocorrência sem descrição'), 500),
      left(failure_record.error_code, 160), failure_record.failed_at,
      failure_record.attempts, failure_record.retryable, next_status, auth.uid(),
      CASE WHEN next_status = 'resolved' THEN now() ELSE NULL END
    );
  ELSE
    UPDATE public.integration_incidents incident
       SET label = CASE WHEN failure_record.failure_id IS NULL
                    THEN incident.label ELSE left(failure_record.label, 160) END,
           description = CASE WHEN failure_record.failure_id IS NULL
                          THEN incident.description
                          ELSE left(COALESCE(NULLIF(btrim(failure_record.description), ''),
                            'Ocorrência sem descrição'), 500) END,
           error_code = CASE WHEN failure_record.failure_id IS NULL
                        THEN incident.error_code ELSE left(failure_record.error_code, 160) END,
           failed_at = COALESCE(failure_record.failed_at, incident.failed_at),
           attempts = COALESCE(failure_record.attempts, incident.attempts),
           retryable = COALESCE(failure_record.retryable, incident.retryable),
           status = next_status,
           assigned_to = CASE WHEN _action IN ('acknowledge', 'reopen')
                         THEN auth.uid() ELSE COALESCE(incident.assigned_to, auth.uid()) END,
           resolved_at = CASE WHEN next_status = 'resolved' THEN now() ELSE NULL END,
           updated_at = now()
     WHERE incident.id = existing_incident.id;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'integration_incident_' || _action,
    'integration_incident', _failure_id,
    jsonb_build_object('integration_key', _integration_key, 'status', next_status)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.organization_integration_incidents(uuid),
  public.manage_integration_incident(uuid, text, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_integration_incidents(uuid),
  public.manage_integration_incident(uuid, text, uuid, text)
  TO authenticated;

-- 20261012120000_integration_recovery_alerts.sql
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

REVOKE ALL ON FUNCTION public.complete_asaas_charge_job(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_asaas_charge_job(uuid, boolean, text)
  TO service_role;

-- 20261014130000_integration_notification_variable_fix.sql (versão final do gatilho)
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
  target_integration_key text;
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
    target_integration_key := 'asaas';
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
    target_integration_key := 'channel-' || channel_name;
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
    target_integration_key := 'channel-' || channel_name;
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
       AND incident.integration_key = target_integration_key
       AND incident.source_failure_id = source_id
       AND incident.status = 'resolved';
    GET DIAGNOSTICS incident_count = ROW_COUNT;
  ELSE
    UPDATE public.integration_incidents incident
       SET status = 'resolved', resolved_at = now(), updated_at = now()
     WHERE incident.organization_id = target_organization_id
       AND incident.integration_key = target_integration_key
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
      jsonb_build_object(
        'integration_key', target_integration_key,
        'source', TG_TABLE_NAME
      )
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

-- 20261013120000_platform_integration_overview.sql
CREATE OR REPLACE FUNCTION public.platform_integration_overview()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  status text,
  issue_count integer,
  failed_charge_jobs integer,
  failed_messages integer,
  connection_errors integer,
  open_incidents integer,
  unassigned_incidents integer,
  last_failure_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT organization.id,
         COALESCE(NULLIF(organization.trade_name, ''), organization.legal_name)::text,
         CASE
           WHEN health.connection_errors > 0 OR health.unassigned_incidents > 0 THEN 'critical'
           WHEN health.issue_count > 0 THEN 'attention'
           ELSE 'healthy'
         END::text,
         health.issue_count,
         health.failed_charge_jobs,
         health.failed_messages,
         health.connection_errors,
         health.open_incidents,
         health.unassigned_incidents,
         health.last_failure_at
    FROM public.organizations organization
    CROSS JOIN LATERAL (
      SELECT
        (charge.failed_count + message.failed_count + connection.error_count
          + incident.open_count)::integer AS issue_count,
        charge.failed_count::integer AS failed_charge_jobs,
        message.failed_count::integer AS failed_messages,
        connection.error_count::integer AS connection_errors,
        incident.open_count::integer AS open_incidents,
        incident.unassigned_count::integer AS unassigned_incidents,
        GREATEST(
          charge.last_failure_at,
          message.last_failure_at,
          connection.last_failure_at,
          incident.last_failure_at
        ) AS last_failure_at
      FROM (
        SELECT count(*) FILTER (WHERE job.status = 'failed') AS failed_count,
               max(job.updated_at) FILTER (WHERE job.status = 'failed') AS last_failure_at
          FROM public.asaas_charge_jobs job
         WHERE job.organization_id = organization.id
      ) charge
      CROSS JOIN (
        SELECT count(*) FILTER (WHERE message.status = 'failed') AS failed_count,
               max(message.occurred_at) FILTER (WHERE message.status = 'failed') AS last_failure_at
          FROM public.communication_channel_messages message
         WHERE message.organization_id = organization.id
      ) message
      CROSS JOIN (
        SELECT count(*) FILTER (
                 WHERE connection.status = 'error' OR connection.last_error_code IS NOT NULL
               ) AS error_count,
               max(connection.updated_at) FILTER (
                 WHERE connection.status = 'error' OR connection.last_error_code IS NOT NULL
               ) AS last_failure_at
          FROM public.communication_channel_connections connection
         WHERE connection.organization_id = organization.id
      ) connection
      CROSS JOIN (
        SELECT count(*) FILTER (WHERE incident.status = 'in_progress') AS open_count,
               count(*) FILTER (
                 WHERE incident.status = 'in_progress' AND incident.assigned_to IS NULL
               ) AS unassigned_count,
               max(incident.updated_at) FILTER (
                 WHERE incident.status = 'in_progress'
               ) AS last_failure_at
          FROM public.integration_incidents incident
         WHERE incident.organization_id = organization.id
      ) incident
    ) health
   WHERE organization.archived_at IS NULL
   ORDER BY
     CASE
       WHEN health.connection_errors > 0 OR health.unassigned_incidents > 0 THEN 0
       WHEN health.issue_count > 0 THEN 1
       ELSE 2
     END,
     health.last_failure_at DESC NULLS LAST,
     organization.legal_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_integration_overview()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_integration_overview()
  TO authenticated;

-- 20261014120000_platform_integration_incident_queue.sql
CREATE OR REPLACE FUNCTION public.platform_integration_incidents(
  _include_resolved boolean DEFAULT false,
  _limit integer DEFAULT 100
)
RETURNS TABLE(
  incident_id uuid,
  failure_id uuid,
  organization_id uuid,
  organization_name text,
  integration_key text,
  label text,
  error_code text,
  failed_at timestamptz,
  attempts integer,
  retryable boolean,
  status text,
  assigned_to uuid,
  assigned_name text,
  updated_at timestamptz,
  is_active_failure boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH active_failure AS (
    SELECT job.organization_id,
           job.id AS failure_id,
           'asaas'::text AS integration_key,
           'Cobrança automática Asaas'::text AS label,
           COALESCE(job.last_error_code, 'ASAAS_OPERATION_FAILED')::text AS error_code,
           COALESCE(job.last_attempt_at, job.updated_at)::timestamptz AS failed_at,
           job.attempts::integer AS attempts,
           true AS retryable
      FROM public.asaas_charge_jobs job
     WHERE job.status = 'failed'
    UNION ALL
    SELECT message.organization_id,
           message.id,
           ('channel-' || connection.channel::text)::text,
           CASE connection.channel
             WHEN 'whatsapp' THEN 'Envio pelo WhatsApp'
             ELSE 'Envio por e-mail'
           END::text,
           COALESCE(message.error_code, 'CHANNEL_DELIVERY_FAILED')::text,
           message.occurred_at,
           1,
           false
      FROM public.communication_channel_messages message
      JOIN public.communication_channel_connections connection
        ON connection.id = message.connection_id
       AND connection.organization_id = message.organization_id
     WHERE message.status = 'failed'
    UNION ALL
    SELECT connection.organization_id,
           connection.id,
           ('channel-' || connection.channel::text)::text,
           CASE connection.channel
             WHEN 'whatsapp' THEN 'Conexão do WhatsApp'
             ELSE 'Conexão de e-mail'
           END::text,
           COALESCE(connection.last_error_code, 'CHANNEL_CONNECTION_ERROR')::text,
           connection.updated_at,
           1,
           false
      FROM public.communication_channel_connections connection
     WHERE connection.status = 'error'
  ), tracked AS (
    SELECT incident.* FROM public.integration_incidents incident
  ), combined AS (
    SELECT tracked.id AS incident_id,
           COALESCE(active_failure.failure_id, tracked.source_failure_id) AS failure_id,
           COALESCE(active_failure.organization_id, tracked.organization_id) AS organization_id,
           COALESCE(active_failure.integration_key, tracked.integration_key) AS integration_key,
           COALESCE(active_failure.label, tracked.label) AS label,
           COALESCE(active_failure.error_code, tracked.error_code) AS error_code,
           COALESCE(active_failure.failed_at, tracked.failed_at) AS failed_at,
           COALESCE(active_failure.attempts, tracked.attempts) AS attempts,
           COALESCE(active_failure.retryable, tracked.retryable) AS retryable,
           COALESCE(tracked.status, 'open') AS status,
           tracked.assigned_to,
           COALESCE(tracked.updated_at, active_failure.failed_at) AS updated_at,
           active_failure.failure_id IS NOT NULL AS is_active_failure
      FROM active_failure
      FULL JOIN tracked
        ON tracked.organization_id = active_failure.organization_id
       AND tracked.integration_key = active_failure.integration_key
       AND tracked.source_failure_id = active_failure.failure_id
  )
  SELECT combined.incident_id,
         combined.failure_id,
         combined.organization_id,
         COALESCE(NULLIF(organization.trade_name, ''), organization.legal_name)::text,
         combined.integration_key,
         combined.label,
         combined.error_code,
         combined.failed_at,
         combined.attempts,
         combined.retryable,
         combined.status,
         combined.assigned_to,
         COALESCE(profile.full_name, profile.email)::text,
         combined.updated_at,
         combined.is_active_failure
    FROM combined
    JOIN public.organizations organization ON organization.id = combined.organization_id
    LEFT JOIN public.profiles profile ON profile.id = combined.assigned_to
   WHERE organization.archived_at IS NULL
     AND (_include_resolved OR combined.status <> 'resolved')
   ORDER BY
     CASE combined.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
     combined.failed_at DESC
   LIMIT least(greatest(_limit, 1), 200);
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_manage_integration_incident(
  _organization_id uuid,
  _integration_key text,
  _failure_id uuid,
  _action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  failure_record record;
  existing_incident public.integration_incidents%ROWTYPE;
  next_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('acknowledge', 'resolve', 'reopen') THEN
    RAISE EXCEPTION 'INTEGRATION_INCIDENT_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _organization_id::text || ':' || _integration_key || ':' || _failure_id::text,
    0
  ));

  SELECT failure.* INTO failure_record
    FROM (
      SELECT job.organization_id,
             job.id AS failure_id,
             'asaas'::text AS integration_key,
             'Cobrança automática Asaas'::text AS label,
             'Falha operacional identificada pela plataforma.'::text AS description,
             COALESCE(job.last_error_code, 'ASAAS_OPERATION_FAILED')::text AS error_code,
             COALESCE(job.last_attempt_at, job.updated_at)::timestamptz AS failed_at,
             job.attempts::integer AS attempts,
             true AS retryable
        FROM public.asaas_charge_jobs job
       WHERE job.status = 'failed'
      UNION ALL
      SELECT message.organization_id,
             message.id,
             ('channel-' || connection.channel::text)::text,
             CASE connection.channel
               WHEN 'whatsapp' THEN 'Envio pelo WhatsApp'
               ELSE 'Envio por e-mail'
             END::text,
             'Falha operacional identificada pela plataforma.'::text,
             COALESCE(message.error_code, 'CHANNEL_DELIVERY_FAILED')::text,
             message.occurred_at,
             1,
             false
        FROM public.communication_channel_messages message
        JOIN public.communication_channel_connections connection
          ON connection.id = message.connection_id
         AND connection.organization_id = message.organization_id
       WHERE message.status = 'failed'
      UNION ALL
      SELECT connection.organization_id,
             connection.id,
             ('channel-' || connection.channel::text)::text,
             CASE connection.channel
               WHEN 'whatsapp' THEN 'Conexão do WhatsApp'
               ELSE 'Conexão de e-mail'
             END::text,
             'Falha operacional identificada pela plataforma.'::text,
             COALESCE(connection.last_error_code, 'CHANNEL_CONNECTION_ERROR')::text,
             connection.updated_at,
             1,
             false
        FROM public.communication_channel_connections connection
       WHERE connection.status = 'error'
    ) failure
   WHERE failure.organization_id = _organization_id
     AND failure.integration_key = _integration_key
     AND failure.failure_id = _failure_id;

  SELECT incident.* INTO existing_incident
    FROM public.integration_incidents incident
   WHERE incident.organization_id = _organization_id
     AND incident.integration_key = _integration_key
     AND incident.source_failure_id = _failure_id
   FOR UPDATE;

  IF failure_record.failure_id IS NULL AND existing_incident.id IS NULL THEN
    RAISE EXCEPTION 'INTEGRATION_INCIDENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  next_status := CASE WHEN _action = 'resolve' THEN 'resolved' ELSE 'in_progress' END;

  IF existing_incident.id IS NULL THEN
    INSERT INTO public.integration_incidents(
      organization_id, integration_key, source_failure_id, label, description,
      error_code, failed_at, attempts, retryable, status, assigned_to, resolved_at
    ) VALUES (
      _organization_id, failure_record.integration_key, failure_record.failure_id,
      left(failure_record.label, 160), failure_record.description,
      left(failure_record.error_code, 160), failure_record.failed_at,
      failure_record.attempts, failure_record.retryable, next_status, auth.uid(),
      CASE WHEN next_status = 'resolved' THEN now() ELSE NULL END
    );
  ELSE
    UPDATE public.integration_incidents incident
       SET label = CASE WHEN failure_record.failure_id IS NULL
                    THEN incident.label ELSE left(failure_record.label, 160) END,
           error_code = CASE WHEN failure_record.failure_id IS NULL
                        THEN incident.error_code ELSE left(failure_record.error_code, 160) END,
           failed_at = COALESCE(failure_record.failed_at, incident.failed_at),
           attempts = COALESCE(failure_record.attempts, incident.attempts),
           retryable = COALESCE(failure_record.retryable, incident.retryable),
           status = next_status,
           assigned_to = CASE WHEN _action IN ('acknowledge', 'reopen')
                         THEN auth.uid() ELSE COALESCE(incident.assigned_to, auth.uid()) END,
           resolved_at = CASE WHEN next_status = 'resolved' THEN now() ELSE NULL END,
           updated_at = now()
     WHERE incident.id = existing_incident.id;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'platform.integration_incident.' || _action,
    'integration_incident', _failure_id,
    jsonb_build_object('integration_key', _integration_key, 'status', next_status)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_integration_incidents(boolean, integer),
  public.platform_manage_integration_incident(uuid, text, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_integration_incidents(boolean, integer),
  public.platform_manage_integration_incident(uuid, text, uuid, text)
  TO authenticated;

-- 20261015120000_platform_integration_incident_activity.sql
CREATE TABLE IF NOT EXISTS public.platform_integration_incident_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  source_failure_id uuid NOT NULL,
  note text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(integration_key) BETWEEN 1 AND 80),
  CHECK (char_length(note) BETWEEN 2 AND 1000)
);

CREATE INDEX IF NOT EXISTS platform_integration_incident_notes_lookup_idx
  ON public.platform_integration_incident_notes(
    organization_id, integration_key, source_failure_id, created_at DESC
  );

ALTER TABLE public.platform_integration_incident_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_integration_incident_notes
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_integration_incident_notes TO service_role;

CREATE OR REPLACE FUNCTION public.platform_integration_incident_activity(
  _organization_id uuid,
  _integration_key text,
  _failure_id uuid,
  _limit integer DEFAULT 30
)
RETURNS TABLE(
  event_id uuid,
  event_type text,
  detail text,
  actor_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT activity.event_id,
         activity.event_type,
         activity.detail,
         activity.actor_name,
         activity.created_at
    FROM (
      SELECT note.id AS event_id,
             'note'::text AS event_type,
             note.note AS detail,
             COALESCE(profile.full_name, profile.email, 'Administrador da plataforma')::text
               AS actor_name,
             note.created_at
        FROM public.platform_integration_incident_notes note
        LEFT JOIN public.profiles profile ON profile.id = note.created_by
       WHERE note.organization_id = _organization_id
         AND note.integration_key = _integration_key
         AND note.source_failure_id = _failure_id
      UNION ALL
      SELECT audit.id,
             audit.action,
             NULL::text,
             COALESCE(audit.actor_name, profile.full_name, profile.email, 'Sistema')::text,
             audit.created_at
        FROM public.audit_logs audit
        LEFT JOIN public.profiles profile ON profile.id = audit.actor_id
       WHERE audit.organization_id = _organization_id
         AND audit.entity = 'integration_incident'
         AND audit.entity_id = _failure_id
         AND audit.metadata ->> 'integration_key' = _integration_key
         AND audit.action <> 'platform.integration_incident.note_added'
    ) activity
   ORDER BY activity.created_at DESC, activity.event_id DESC
   LIMIT least(greatest(_limit, 1), 100);
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_add_integration_incident_note(
  _organization_id uuid,
  _integration_key text,
  _failure_id uuid,
  _note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  clean_note text := btrim(COALESCE(_note, ''));
  new_note_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF char_length(clean_note) < 2 OR char_length(clean_note) > 1000 THEN
    RAISE EXCEPTION 'INTEGRATION_INCIDENT_NOTE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.integration_incidents incident
     WHERE incident.organization_id = _organization_id
       AND incident.integration_key = _integration_key
       AND incident.source_failure_id = _failure_id
    UNION ALL
    SELECT 1
      FROM public.asaas_charge_jobs job
     WHERE job.organization_id = _organization_id
       AND _integration_key = 'asaas'
       AND job.id = _failure_id
       AND job.status = 'failed'
    UNION ALL
    SELECT 1
      FROM public.communication_channel_messages message
      JOIN public.communication_channel_connections connection
        ON connection.id = message.connection_id
       AND connection.organization_id = message.organization_id
     WHERE message.organization_id = _organization_id
       AND _integration_key = 'channel-' || connection.channel::text
       AND message.id = _failure_id
       AND message.status = 'failed'
    UNION ALL
    SELECT 1
      FROM public.communication_channel_connections connection
     WHERE connection.organization_id = _organization_id
       AND _integration_key = 'channel-' || connection.channel::text
       AND connection.id = _failure_id
       AND connection.status = 'error'
  ) THEN
    RAISE EXCEPTION 'INTEGRATION_INCIDENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.platform_integration_incident_notes(
    organization_id, integration_key, source_failure_id, note, created_by
  ) VALUES (
    _organization_id, _integration_key, _failure_id, clean_note, auth.uid()
  ) RETURNING id INTO new_note_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'platform.integration_incident.note_added',
    'integration_incident', _failure_id,
    jsonb_build_object('integration_key', _integration_key, 'note_id', new_note_id)
  );

  RETURN new_note_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_integration_incident_activity(uuid, text, uuid, integer),
  public.platform_add_integration_incident_note(uuid, text, uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_integration_incident_activity(uuid, text, uuid, integer),
  public.platform_add_integration_incident_note(uuid, text, uuid, text)
  TO authenticated;