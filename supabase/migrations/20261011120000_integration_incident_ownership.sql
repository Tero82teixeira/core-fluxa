-- Acompanhamento administrativo de falhas de integração com responsável e histórico.

BEGIN;

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

  -- Serializa duas ações simultâneas sobre a mesma ocorrência antes do upsert.
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

COMMIT;
