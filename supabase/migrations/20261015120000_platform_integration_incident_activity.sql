-- Histórico operacional privado da plataforma para incidentes de integração.

BEGIN;

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

COMMIT;
