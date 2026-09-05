-- Client Portal: detailed process progress with explicitly shared public history.

CREATE UNIQUE INDEX IF NOT EXISTS process_movements_organization_process_id_key
  ON public.process_movements(organization_id, process_id, id);

CREATE TABLE public.client_portal_process_movement_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  process_id uuid NOT NULL,
  movement_id uuid NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  shared_by uuid,
  shared_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_process_movement_shares_process_fkey
    FOREIGN KEY (organization_id, client_id, process_id)
    REFERENCES public.processes(organization_id, client_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_process_movement_shares_movement_fkey
    FOREIGN KEY (organization_id, process_id, movement_id)
    REFERENCES public.process_movements(organization_id, process_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_process_movement_shares_key
    UNIQUE (organization_id, client_id, process_id, movement_id)
);

CREATE INDEX client_portal_process_movement_shares_lookup_idx
  ON public.client_portal_process_movement_shares(
    organization_id, client_id, process_id, is_shared, updated_at DESC
  );
ALTER TABLE public.client_portal_process_movement_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_portal_process_movement_shares
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_portal_process_movement_shares TO service_role;

CREATE TRIGGER client_portal_process_movement_shares_set_updated_at
  BEFORE UPDATE ON public.client_portal_process_movement_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.client_portal_process_timeline_management(
  _organization_id uuid,
  _client_id uuid,
  _process_id uuid
)
RETURNS TABLE(
  movement_id uuid,
  description text,
  from_stage text,
  to_stage text,
  occurred_at timestamptz,
  is_shared boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.processes process
     WHERE process.organization_id = _organization_id
       AND process.client_id = _client_id
       AND process.id = _process_id
       AND process.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PROCESS_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT movement.id,
         movement.description,
         movement.from_stage::text,
         movement.to_stage::text,
         movement.created_at,
         COALESCE(share.is_shared, false)
    FROM public.process_movements movement
    LEFT JOIN public.client_portal_process_movement_shares share
      ON share.organization_id = movement.organization_id
     AND share.client_id = _client_id
     AND share.process_id = movement.process_id
     AND share.movement_id = movement.id
   WHERE movement.organization_id = _organization_id
     AND movement.process_id = _process_id
   ORDER BY movement.created_at DESC, movement.id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_client_portal_process_movement_shared(
  _organization_id uuid,
  _client_id uuid,
  _process_id uuid,
  _movement_id uuid,
  _shared boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_description text;
  v_actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT movement.description INTO v_description
    FROM public.processes process
    JOIN public.process_movements movement
      ON movement.organization_id = process.organization_id
     AND movement.process_id = process.id
   WHERE process.organization_id = _organization_id
     AND process.client_id = _client_id
     AND process.id = _process_id
     AND process.archived_at IS NULL
     AND movement.id = _movement_id;
  IF v_description IS NULL THEN RAISE EXCEPTION 'PROCESS_MOVEMENT_NOT_FOUND'; END IF;
  IF _shared AND NOT EXISTS (
    SELECT 1 FROM public.client_portal_process_shares share
     WHERE share.organization_id = _organization_id
       AND share.client_id = _client_id
       AND share.process_id = _process_id
       AND share.is_shared
  ) THEN
    RAISE EXCEPTION 'PROCESS_NOT_SHARED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.client_portal_process_movement_shares(
    organization_id, client_id, process_id, movement_id, is_shared,
    shared_by, shared_at, revoked_by, revoked_at
  ) VALUES (
    _organization_id, _client_id, _process_id, _movement_id, _shared,
    CASE WHEN _shared THEN auth.uid() END,
    CASE WHEN _shared THEN now() END,
    CASE WHEN NOT _shared THEN auth.uid() END,
    CASE WHEN NOT _shared THEN now() END
  )
  ON CONFLICT (organization_id, client_id, process_id, movement_id) DO UPDATE SET
    is_shared = EXCLUDED.is_shared,
    shared_by = CASE WHEN EXCLUDED.is_shared THEN auth.uid()
                     ELSE client_portal_process_movement_shares.shared_by END,
    shared_at = CASE WHEN EXCLUDED.is_shared THEN now()
                     ELSE client_portal_process_movement_shares.shared_at END,
    revoked_by = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE auth.uid() END,
    revoked_at = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE now() END;

  SELECT profile.full_name INTO v_actor_name
    FROM public.profiles profile WHERE profile.id = auth.uid();
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), v_actor_name,
    CASE WHEN _shared THEN 'client_portal.process_update_shared'
         ELSE 'client_portal.process_update_revoked' END,
    'process_movement', _movement_id,
    jsonb_build_object('client_id', _client_id, 'process_id', _process_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_process_timeline(_process_id uuid)
RETURNS TABLE(
  movement_id uuid,
  description text,
  from_stage text,
  to_stage text,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT movement.id,
         movement.description,
         movement.from_stage::text,
         movement.to_stage::text,
         movement.created_at
    FROM public.client_portal_access access
    JOIN public.client_portal_process_shares process_share
      ON process_share.organization_id = access.organization_id
     AND process_share.client_id = access.client_id
     AND process_share.process_id = _process_id
     AND process_share.is_shared
    JOIN public.processes process
      ON process.organization_id = process_share.organization_id
     AND process.client_id = process_share.client_id
     AND process.id = process_share.process_id
     AND process.archived_at IS NULL
    JOIN public.client_portal_process_movement_shares movement_share
      ON movement_share.organization_id = process.organization_id
     AND movement_share.client_id = process.client_id
     AND movement_share.process_id = process.id
     AND movement_share.is_shared
    JOIN public.process_movements movement
      ON movement.organization_id = movement_share.organization_id
     AND movement.process_id = movement_share.process_id
     AND movement.id = movement_share.movement_id
   WHERE access.user_id = auth.uid()
     AND access.is_active
   ORDER BY movement.created_at, movement.id;
$function$;

-- Add process_id to the already-reviewed document projection so the portal can
-- group only documents that were individually shared for the selected process.
DROP FUNCTION IF EXISTS public.client_portal_documents();
CREATE FUNCTION public.client_portal_documents()
RETURNS TABLE(
  access_id uuid,
  document_id uuid,
  title text,
  original_file_name text,
  file_path text,
  file_extension text,
  mime_type text,
  file_size bigint,
  status text,
  expiration_date date,
  created_at timestamptz,
  process_id uuid,
  process_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT access.id,
         document.id,
         document.title,
         document.original_file_name,
         document.file_path,
         document.file_extension,
         document.mime_type,
         document.file_size,
         document.status::text,
         document.expiration_date,
         document.created_at,
         document.process_id,
         process.code
    FROM public.client_portal_access access
    JOIN public.organizations organization
      ON organization.id = access.organization_id
     AND organization.archived_at IS NULL
    JOIN public.clients client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id
     AND client.archived_at IS NULL
    JOIN public.client_portal_document_shares share
      ON share.organization_id = access.organization_id
     AND share.client_id = access.client_id
     AND share.is_shared
    JOIN public.documents document
      ON document.organization_id = share.organization_id
     AND document.client_id = share.client_id
     AND document.id = share.document_id
     AND document.archived_at IS NULL
    LEFT JOIN public.processes process
      ON process.organization_id = document.organization_id
     AND process.id = document.process_id
   WHERE access.user_id = auth.uid()
     AND access.is_active
   ORDER BY document.updated_at DESC, document.id;
$function$;

REVOKE ALL ON FUNCTION public.client_portal_process_timeline_management(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_client_portal_process_movement_shared(uuid, uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_process_timeline(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_documents()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.client_portal_process_timeline_management(uuid, uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_portal_process_movement_shared(uuid, uuid, uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_process_timeline(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_documents()
  TO authenticated;
