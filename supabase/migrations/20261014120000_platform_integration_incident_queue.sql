-- Fila operacional de incidentes para a administração da plataforma.
-- A projeção é deliberadamente mínima e nunca retorna conteúdo, credenciais ou payloads.

BEGIN;

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

COMMIT;
