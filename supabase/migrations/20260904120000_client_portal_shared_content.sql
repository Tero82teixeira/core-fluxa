-- Client Portal, stage 3: explicit process and document sharing.
-- Operational tables remain private. Portal readers receive only a reviewed,
-- minimal projection through RPCs that derive the client from auth.uid().

CREATE UNIQUE INDEX IF NOT EXISTS processes_organization_client_id_key
  ON public.processes(organization_id, client_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS documents_organization_client_id_key
  ON public.documents(organization_id, client_id, id);

CREATE TABLE public.client_portal_process_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  process_id uuid NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  shared_by uuid,
  shared_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_process_shares_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_process_shares_process_fkey
    FOREIGN KEY (organization_id, client_id, process_id)
    REFERENCES public.processes(organization_id, client_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_process_shares_key
    UNIQUE (organization_id, client_id, process_id)
);

CREATE TABLE public.client_portal_document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  document_id uuid NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  shared_by uuid,
  shared_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_document_shares_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_document_shares_document_fkey
    FOREIGN KEY (organization_id, client_id, document_id)
    REFERENCES public.documents(organization_id, client_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_document_shares_key
    UNIQUE (organization_id, client_id, document_id)
);

CREATE INDEX client_portal_process_shares_lookup_idx
  ON public.client_portal_process_shares(organization_id, client_id, is_shared);
CREATE INDEX client_portal_document_shares_lookup_idx
  ON public.client_portal_document_shares(organization_id, client_id, is_shared);

ALTER TABLE public.client_portal_process_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_document_shares ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_portal_process_shares FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_portal_document_shares FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_portal_process_shares, public.client_portal_document_shares
  TO service_role;

CREATE TRIGGER client_portal_process_shares_set_updated_at
  BEFORE UPDATE ON public.client_portal_process_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER client_portal_document_shares_set_updated_at
  BEFORE UPDATE ON public.client_portal_document_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.client_portal_share_management(
  _organization_id uuid,
  _client_id uuid
)
RETURNS TABLE(
  item_type text,
  item_id uuid,
  title text,
  subtitle text,
  status text,
  is_shared boolean,
  updated_at timestamptz
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
    SELECT 1 FROM public.clients client
     WHERE client.organization_id = _organization_id
       AND client.id = _client_id
       AND client.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT items.item_type, items.item_id, items.title, items.subtitle,
         items.status, items.is_shared, items.updated_at
  FROM (
    SELECT
      'process'::text AS item_type,
      process.id AS item_id,
      COALESCE(NULLIF(process.title, ''), process.code) AS title,
      process.code AS subtitle,
      process.stage::text AS status,
      COALESCE(share.is_shared, false) AS is_shared,
      COALESCE(share.updated_at, process.updated_at) AS updated_at
    FROM public.processes process
    LEFT JOIN public.client_portal_process_shares share
      ON share.organization_id = process.organization_id
     AND share.client_id = process.client_id
     AND share.process_id = process.id
    WHERE process.organization_id = _organization_id
      AND process.client_id = _client_id
      AND process.archived_at IS NULL

    UNION ALL

    SELECT
      'document'::text AS item_type,
      document.id AS item_id,
      document.title,
      document.original_file_name AS subtitle,
      document.status::text AS status,
      COALESCE(share.is_shared, false) AS is_shared,
      COALESCE(share.updated_at, document.updated_at) AS updated_at
    FROM public.documents document
    LEFT JOIN public.client_portal_document_shares share
      ON share.organization_id = document.organization_id
     AND share.client_id = document.client_id
     AND share.document_id = document.id
    WHERE document.organization_id = _organization_id
      AND document.client_id = _client_id
      AND document.archived_at IS NULL
  ) items
  ORDER BY items.item_type, items.updated_at DESC, items.item_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_client_portal_item_shared(
  _organization_id uuid,
  _client_id uuid,
  _item_type text,
  _item_id uuid,
  _shared boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_title text;
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

  IF _item_type = 'process' THEN
    SELECT COALESCE(NULLIF(process.title, ''), process.code)
      INTO v_title
      FROM public.processes process
     WHERE process.organization_id = _organization_id
       AND process.client_id = _client_id
       AND process.id = _item_id
       AND (NOT _shared OR process.archived_at IS NULL);
    IF v_title IS NULL THEN RAISE EXCEPTION 'PROCESS_NOT_FOUND'; END IF;

    INSERT INTO public.client_portal_process_shares(
      organization_id, client_id, process_id, is_shared,
      shared_by, shared_at, revoked_by, revoked_at
    ) VALUES (
      _organization_id, _client_id, _item_id, _shared,
      CASE WHEN _shared THEN auth.uid() END,
      CASE WHEN _shared THEN now() END,
      CASE WHEN NOT _shared THEN auth.uid() END,
      CASE WHEN NOT _shared THEN now() END
    )
    ON CONFLICT (organization_id, client_id, process_id) DO UPDATE SET
      is_shared = EXCLUDED.is_shared,
      shared_by = CASE WHEN EXCLUDED.is_shared THEN auth.uid()
                       ELSE client_portal_process_shares.shared_by END,
      shared_at = CASE WHEN EXCLUDED.is_shared THEN now()
                       ELSE client_portal_process_shares.shared_at END,
      revoked_by = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE auth.uid() END,
      revoked_at = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE now() END;
  ELSIF _item_type = 'document' THEN
    SELECT document.title
      INTO v_title
      FROM public.documents document
     WHERE document.organization_id = _organization_id
       AND document.client_id = _client_id
       AND document.id = _item_id
       AND (NOT _shared OR document.archived_at IS NULL);
    IF v_title IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;

    INSERT INTO public.client_portal_document_shares(
      organization_id, client_id, document_id, is_shared,
      shared_by, shared_at, revoked_by, revoked_at
    ) VALUES (
      _organization_id, _client_id, _item_id, _shared,
      CASE WHEN _shared THEN auth.uid() END,
      CASE WHEN _shared THEN now() END,
      CASE WHEN NOT _shared THEN auth.uid() END,
      CASE WHEN NOT _shared THEN now() END
    )
    ON CONFLICT (organization_id, client_id, document_id) DO UPDATE SET
      is_shared = EXCLUDED.is_shared,
      shared_by = CASE WHEN EXCLUDED.is_shared THEN auth.uid()
                       ELSE client_portal_document_shares.shared_by END,
      shared_at = CASE WHEN EXCLUDED.is_shared THEN now()
                       ELSE client_portal_document_shares.shared_at END,
      revoked_by = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE auth.uid() END,
      revoked_at = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE now() END;
  ELSE
    RAISE EXCEPTION 'INVALID_ITEM_TYPE';
  END IF;

  SELECT profile.full_name INTO v_actor_name
    FROM public.profiles profile WHERE profile.id = auth.uid();
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id,
    auth.uid(),
    v_actor_name,
    CASE WHEN _shared THEN 'client_portal.item_shared'
         ELSE 'client_portal.item_revoked' END,
    _item_type,
    _item_id,
    jsonb_build_object('client_id', _client_id, 'title', v_title)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_processes()
RETURNS TABLE(
  access_id uuid,
  process_id uuid,
  code text,
  title text,
  stage text,
  protocol text,
  opened_at date,
  due_date date,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    access.id,
    process.id,
    process.code,
    COALESCE(NULLIF(process.title, ''), process.code),
    process.stage::text,
    process.protocol,
    process.opened_at,
    process.due_date,
    process.updated_at
  FROM public.client_portal_access access
  JOIN public.organizations organization
    ON organization.id = access.organization_id
   AND organization.archived_at IS NULL
  JOIN public.clients client
    ON client.organization_id = access.organization_id
   AND client.id = access.client_id
   AND client.archived_at IS NULL
  JOIN public.client_portal_process_shares share
    ON share.organization_id = access.organization_id
   AND share.client_id = access.client_id
   AND share.is_shared
  JOIN public.processes process
    ON process.organization_id = share.organization_id
   AND process.client_id = share.client_id
   AND process.id = share.process_id
   AND process.archived_at IS NULL
  WHERE access.user_id = auth.uid()
    AND access.is_active
  ORDER BY process.due_date NULLS LAST, process.updated_at DESC, process.id;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_documents()
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
  process_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    access.id,
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

CREATE OR REPLACE FUNCTION public.can_access_client_portal_document(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
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
     WHERE access.user_id = auth.uid()
       AND access.is_active
       AND document.file_path = _file_path
  );
$function$;

CREATE POLICY client_portal_documents_select
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'organization-documents'
    AND public.can_access_client_portal_document(name)
  );

REVOKE ALL ON FUNCTION public.client_portal_share_management(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_client_portal_item_shared(uuid, uuid, text, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_processes()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_documents()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_client_portal_document(text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.client_portal_share_management(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_portal_item_shared(uuid, uuid, text, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_processes()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_documents()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client_portal_document(text)
  TO authenticated;
