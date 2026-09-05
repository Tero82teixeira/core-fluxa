-- Client Portal, stage 4: document requests and narrowly authorized client uploads.
-- A portal identity never receives direct access to operational tables. Every upload
-- is bound to one pending request, one short-lived intent and one exact storage path.

CREATE UNIQUE INDEX IF NOT EXISTS documents_organization_client_process_id_key
  ON public.documents(organization_id, client_id, process_id, id);

CREATE TABLE public.client_portal_document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  process_id uuid,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  due_date date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'completed', 'cancelled')),
  submitted_document_id uuid,
  created_by uuid NOT NULL,
  submitted_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_document_requests_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_document_requests_process_fkey
    FOREIGN KEY (organization_id, client_id, process_id)
    REFERENCES public.processes(organization_id, client_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_document_requests_document_fkey
    FOREIGN KEY (organization_id, client_id, process_id, submitted_document_id)
    REFERENCES public.documents(organization_id, client_id, process_id, id) ON DELETE RESTRICT,
  CONSTRAINT client_portal_document_requests_submission_consistency
    CHECK (
      (status = 'pending' AND submitted_document_id IS NULL AND submitted_at IS NULL
        AND completed_at IS NULL AND cancelled_at IS NULL)
      OR (status = 'submitted' AND submitted_document_id IS NOT NULL AND submitted_at IS NOT NULL
        AND completed_at IS NULL AND cancelled_at IS NULL)
      OR (status = 'completed' AND submitted_document_id IS NOT NULL AND submitted_at IS NOT NULL
        AND completed_at IS NOT NULL AND cancelled_at IS NULL)
      OR (status = 'cancelled' AND submitted_document_id IS NULL AND submitted_at IS NULL
        AND completed_at IS NULL AND cancelled_at IS NOT NULL)
    )
);

CREATE INDEX client_portal_document_requests_management_idx
  ON public.client_portal_document_requests(organization_id, client_id, status, due_date);
CREATE INDEX client_portal_document_requests_portal_idx
  ON public.client_portal_document_requests(client_id, status, created_at DESC);
CREATE UNIQUE INDEX client_portal_document_requests_scope_id_key
  ON public.client_portal_document_requests(organization_id, client_id, id);

CREATE TABLE public.client_portal_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.client_portal_document_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  file_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL,
  stored_file_name text NOT NULL,
  file_extension text NOT NULL CHECK (file_extension IN ('pdf','jpg','jpeg','png','docx','xlsx')),
  mime_type text NOT NULL,
  expected_size bigint NOT NULL CHECK (expected_size BETWEEN 1 AND 20971520),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_upload_intents_request_scope_fkey
    FOREIGN KEY (organization_id, client_id, request_id)
    REFERENCES public.client_portal_document_requests(organization_id, client_id, id) ON DELETE CASCADE
);

CREATE INDEX client_portal_upload_intents_active_idx
  ON public.client_portal_upload_intents(request_id, user_id, expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.client_portal_document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_portal_document_requests, public.client_portal_upload_intents
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_portal_document_requests, public.client_portal_upload_intents
  TO service_role;

CREATE TRIGGER client_portal_document_requests_set_updated_at
  BEFORE UPDATE ON public.client_portal_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.manage_client_portal_document_requests(
  _organization_id uuid,
  _client_id uuid
)
RETURNS TABLE(
  request_id uuid,
  process_id uuid,
  process_code text,
  title text,
  description text,
  due_date date,
  status text,
  submitted_document_id uuid,
  submitted_file_name text,
  submitted_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador']::public.app_role[])
  THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients client
     WHERE client.organization_id = _organization_id
       AND client.id = _client_id AND client.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'CLIENT_NOT_FOUND'; END IF;

  RETURN QUERY
  SELECT request.id, request.process_id, process.code, request.title,
         request.description, request.due_date, request.status,
         request.submitted_document_id, document.original_file_name,
         request.submitted_at, request.created_at
    FROM public.client_portal_document_requests request
    LEFT JOIN public.processes process
      ON process.organization_id = request.organization_id
     AND process.client_id = request.client_id
     AND process.id = request.process_id
    LEFT JOIN public.documents document
      ON document.organization_id = request.organization_id
     AND document.client_id = request.client_id
     AND document.id = request.submitted_document_id
   WHERE request.organization_id = _organization_id
     AND request.client_id = _client_id
   ORDER BY CASE request.status WHEN 'pending' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,
            request.due_date NULLS LAST, request.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_client_portal_document_request(
  _organization_id uuid,
  _client_id uuid,
  _process_id uuid DEFAULT NULL,
  _title text DEFAULT NULL,
  _description text DEFAULT NULL,
  _due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador']::public.app_role[])
  THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  IF btrim(COALESCE(_title, '')) = '' OR char_length(btrim(_title)) > 160
  THEN RAISE EXCEPTION 'INVALID_TITLE'; END IF;
  IF char_length(COALESCE(_description, '')) > 2000 THEN RAISE EXCEPTION 'INVALID_DESCRIPTION'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients client
     WHERE client.organization_id = _organization_id
       AND client.id = _client_id AND client.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'CLIENT_NOT_FOUND'; END IF;
  IF _process_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.processes process
     WHERE process.organization_id = _organization_id
       AND process.client_id = _client_id AND process.id = _process_id
       AND process.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'PROCESS_NOT_FOUND'; END IF;

  INSERT INTO public.client_portal_document_requests(
    organization_id, client_id, process_id, title, description, due_date, created_by
  ) VALUES (
    _organization_id, _client_id, _process_id, btrim(_title),
    NULLIF(btrim(COALESCE(_description, '')), ''), _due_date, auth.uid()
  ) RETURNING id INTO v_id;

  SELECT profile.full_name INTO v_actor_name FROM public.profiles profile WHERE profile.id = auth.uid();
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), v_actor_name, 'client_portal.document_requested',
    'client_portal_document_request', v_id,
    jsonb_build_object('client_id', _client_id, 'process_id', _process_id, 'title', btrim(_title), 'due_date', _due_date)
  );
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_client_portal_document_request_status(
  _request_id uuid,
  _status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_request public.client_portal_document_requests%ROWTYPE; v_actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_request FROM public.client_portal_document_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF NOT public.has_org_role(v_request.organization_id, ARRAY['proprietario','administrador']::public.app_role[])
  THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  IF _status = 'cancelled' AND v_request.status = 'pending' THEN
    UPDATE public.client_portal_document_requests
       SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
     WHERE id = _request_id;
  ELSIF _status = 'completed' AND v_request.status = 'submitted' THEN
    UPDATE public.client_portal_document_requests
       SET status = 'completed', completed_by = auth.uid(), completed_at = now()
     WHERE id = _request_id;
  ELSE
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION';
  END IF;
  SELECT profile.full_name INTO v_actor_name FROM public.profiles profile WHERE profile.id = auth.uid();
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    v_request.organization_id, auth.uid(), v_actor_name,
    CASE _status WHEN 'cancelled' THEN 'client_portal.document_request_cancelled'
                 ELSE 'client_portal.document_request_completed' END,
    'client_portal_document_request', _request_id,
    jsonb_build_object('client_id', v_request.client_id, 'from', v_request.status, 'to', _status)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_document_requests()
RETURNS TABLE(
  access_id uuid,
  request_id uuid,
  organization_name text,
  client_name text,
  process_code text,
  title text,
  description text,
  due_date date,
  status text,
  submitted_document_id uuid,
  submitted_file_name text,
  submitted_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT access.id, request.id, organization.legal_name, client.name,
         process.code, request.title, request.description, request.due_date,
         request.status, request.submitted_document_id, document.original_file_name,
         request.submitted_at, request.created_at
    FROM public.client_portal_access access
    JOIN public.organizations organization
      ON organization.id = access.organization_id AND organization.archived_at IS NULL
    JOIN public.clients client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id AND client.archived_at IS NULL
    JOIN public.client_portal_document_requests request
      ON request.organization_id = access.organization_id AND request.client_id = access.client_id
    LEFT JOIN public.processes process
      ON process.organization_id = request.organization_id
     AND process.client_id = request.client_id AND process.id = request.process_id
    LEFT JOIN public.documents document
      ON document.organization_id = request.organization_id
     AND document.client_id = request.client_id AND document.id = request.submitted_document_id
   WHERE access.user_id = auth.uid() AND access.is_active
   ORDER BY CASE request.status WHEN 'pending' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END,
            request.due_date NULLS LAST, request.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_client_portal_document_upload(
  _request_id uuid,
  _original_file_name text,
  _mime_type text,
  _file_size bigint
)
RETURNS TABLE(upload_intent_id uuid, file_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_request public.client_portal_document_requests%ROWTYPE;
  v_extension text;
  v_expected_mime text;
  v_stored_name text;
  v_path text;
  v_intent_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  SELECT request.* INTO v_request
    FROM public.client_portal_document_requests request
    JOIN public.client_portal_access access
      ON access.organization_id = request.organization_id
     AND access.client_id = request.client_id
     AND access.user_id = auth.uid() AND access.is_active
    JOIN public.organizations organization
      ON organization.id = request.organization_id AND organization.archived_at IS NULL
    JOIN public.clients client
      ON client.organization_id = request.organization_id
     AND client.id = request.client_id AND client.archived_at IS NULL
   WHERE request.id = _request_id
   FOR UPDATE OF request;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'REQUEST_NOT_PENDING'; END IF;
  IF char_length(COALESCE(_original_file_name, '')) NOT BETWEEN 1 AND 255
     OR _original_file_name ~ '[[:cntrl:]/\\]'
  THEN RAISE EXCEPTION 'INVALID_FILE_NAME'; END IF;
  v_extension := lower(substring(_original_file_name from '\\.([^.]+)$'));
  v_expected_mime := CASE v_extension
    WHEN 'pdf' THEN 'application/pdf'
    WHEN 'jpg' THEN 'image/jpeg'
    WHEN 'jpeg' THEN 'image/jpeg'
    WHEN 'png' THEN 'image/png'
    WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ELSE NULL END;
  IF v_expected_mime IS NULL THEN RAISE EXCEPTION 'INVALID_FILE_EXTENSION'; END IF;
  IF _mime_type <> v_expected_mime THEN RAISE EXCEPTION 'INVALID_MIME_TYPE'; END IF;
  IF _file_size NOT BETWEEN 1 AND 20971520 THEN RAISE EXCEPTION 'INVALID_FILE_SIZE'; END IF;

  UPDATE public.client_portal_upload_intents
     SET expires_at = now()
   WHERE request_id = _request_id AND user_id = auth.uid()
     AND used_at IS NULL AND expires_at > now();
  v_intent_id := gen_random_uuid();
  v_stored_name := gen_random_uuid()::text || '.' || v_extension;
  v_path := v_request.organization_id::text || '/portal/solicitacoes/' ||
            v_request.id::text || '/' || v_stored_name;
  INSERT INTO public.client_portal_upload_intents(
    id, request_id, organization_id, client_id, user_id, file_path,
    original_file_name, stored_file_name, file_extension, mime_type,
    expected_size, expires_at
  ) VALUES (
    v_intent_id, v_request.id, v_request.organization_id, v_request.client_id,
    auth.uid(), v_path, _original_file_name, v_stored_name, v_extension,
    _mime_type, _file_size, now() + interval '10 minutes'
  );
  RETURN QUERY SELECT v_intent_id, v_path;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_client_portal_document(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.client_portal_upload_intents intent
    JOIN public.client_portal_document_requests request ON request.id = intent.request_id
    JOIN public.client_portal_access access
      ON access.organization_id = intent.organization_id
     AND access.client_id = intent.client_id
     AND access.user_id = intent.user_id AND access.is_active
    WHERE intent.user_id = auth.uid() AND intent.file_path = _file_path
      AND intent.used_at IS NULL AND intent.expires_at > now()
      AND request.status = 'pending'
  );
$function$;

CREATE POLICY client_portal_documents_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'organization-documents'
    AND owner_id = (SELECT auth.uid()::text)
    AND public.can_upload_client_portal_document(name)
  );

CREATE POLICY client_portal_documents_delete_unused
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'organization-documents'
    AND owner_id = (SELECT auth.uid()::text)
    AND public.can_upload_client_portal_document(name)
  );

CREATE OR REPLACE FUNCTION public.is_client_portal_upload_context(
  _organization_id uuid,
  _client_id uuid,
  _file_path text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_setting text := current_setting('app.client_portal_upload_intent', true);
BEGIN
  IF v_setting IS NULL OR v_setting !~ '^[0-9a-fA-F-]{36}$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.client_portal_upload_intents intent
    JOIN public.client_portal_document_requests request ON request.id = intent.request_id
    JOIN public.client_portal_access access
      ON access.organization_id = intent.organization_id
     AND access.client_id = intent.client_id
     AND access.user_id = intent.user_id AND access.is_active
    WHERE intent.id = v_setting::uuid AND intent.user_id = auth.uid()
      AND intent.organization_id = _organization_id AND intent.client_id = _client_id
      AND intent.file_path = _file_path AND intent.used_at IS NULL
      AND intent.expires_at > now() AND request.status = 'pending'
  );
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END;
$function$;

-- Preserve internal document authorization and add only the exact portal intent path.
CREATE OR REPLACE FUNCTION public.documents_authorization_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid(); v_name text; v_uploader boolean; v_reviewer boolean;
  v_new_version boolean := false; v_portal_upload boolean := false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'DOCUMENT_AUTH_REQUIRED'; END IF;
  v_uploader := public.has_org_role(NEW.organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]);
  v_reviewer := public.has_org_role(NEW.organization_id, ARRAY['superadmin','proprietario','administrador']::public.app_role[]);
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_actor;

  IF TG_OP = 'INSERT' THEN
    v_portal_upload := NEW.client_id IS NOT NULL
      AND public.is_client_portal_upload_context(NEW.organization_id, NEW.client_id, NEW.file_path);
    IF v_portal_upload THEN
      SELECT client.name INTO v_name FROM public.clients client
       WHERE client.organization_id = NEW.organization_id AND client.id = NEW.client_id;
      NEW.status := 'recebido'; NEW.current_version := 1;
      NEW.uploaded_by := v_actor; NEW.uploaded_by_name := COALESCE(v_name, 'Cliente do portal');
      NEW.reviewed_by := NULL; NEW.reviewed_by_name := NULL; NEW.reviewed_at := NULL;
      NEW.rejection_reason := NULL; NEW.archived_at := NULL; NEW.notes := NULL;
      RETURN NEW;
    END IF;
    IF NOT v_uploader THEN RAISE EXCEPTION 'DOCUMENT_UPLOAD_DENIED'; END IF;
    NEW.uploaded_by := v_actor; NEW.uploaded_by_name := COALESCE(v_name, NEW.uploaded_by_name);
    IF NOT v_reviewer AND (NEW.status IN ('aprovado','rejeitado','arquivado') OR NEW.archived_at IS NOT NULL
      OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_by_name IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL)
    THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
    IF v_reviewer AND NEW.status IN ('aprovado','rejeitado','em_analise') THEN
      NEW.reviewed_by := v_actor; NEW.reviewed_by_name := v_name; NEW.reviewed_at := now();
      IF NEW.status <> 'rejeitado' THEN NEW.rejection_reason := NULL; END IF;
    ELSE
      NEW.reviewed_by := NULL; NEW.reviewed_by_name := NULL; NEW.reviewed_at := NULL; NEW.rejection_reason := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'DOCUMENT_ORGANIZATION_IMMUTABLE'; END IF;
  v_new_version := v_uploader AND NEW.current_version = OLD.current_version + 1
    AND NEW.file_path IS DISTINCT FROM OLD.file_path;
  IF v_new_version THEN
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
    IF (to_jsonb(NEW) - ARRAY['file_path','original_file_name','stored_file_name','file_extension','mime_type','file_size','current_version','status','uploaded_by','uploaded_by_name','reviewed_by','reviewed_by_name','reviewed_at','rejection_reason','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['file_path','original_file_name','stored_file_name','file_extension','mime_type','file_size','current_version','status','uploaded_by','uploaded_by_name','reviewed_by','reviewed_by_name','reviewed_at','rejection_reason','updated_at'])
    THEN RAISE EXCEPTION 'DOCUMENT_VERSION_FIELDS_DENIED'; END IF;
    NEW.status := 'em_analise'; NEW.archived_at := OLD.archived_at;
    NEW.uploaded_by := v_actor; NEW.uploaded_by_name := COALESCE(v_name, OLD.uploaded_by_name);
    NEW.reviewed_by := NULL; NEW.reviewed_by_name := NULL; NEW.reviewed_at := NULL; NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;
  IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR NEW.uploaded_by_name IS DISTINCT FROM OLD.uploaded_by_name
  THEN RAISE EXCEPTION 'DOCUMENT_PROVENANCE_IMMUTABLE'; END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at AND NOT v_reviewer
  THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT v_reviewer THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
    NEW.reviewed_by := v_actor; NEW.reviewed_by_name := COALESCE(v_name, NEW.reviewed_by_name); NEW.reviewed_at := now();
    IF NEW.status <> 'rejeitado' THEN NEW.rejection_reason := NULL; END IF;
  ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_by_name IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  THEN RAISE EXCEPTION 'DOCUMENT_REVIEW_PROVENANCE_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.document_versions_authorization_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_name text; v_document_org uuid; v_client_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'DOCUMENT_AUTH_REQUIRED'; END IF;
  SELECT organization_id, client_id INTO v_document_org, v_client_id
    FROM public.documents WHERE id = NEW.document_id;
  IF v_document_org IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
  IF v_document_org <> NEW.organization_id THEN RAISE EXCEPTION 'DOCUMENT_VERSION_ORG_MISMATCH'; END IF;
  IF v_client_id IS NOT NULL
     AND public.is_client_portal_upload_context(NEW.organization_id, v_client_id, NEW.file_path) THEN
    SELECT client.name INTO v_name FROM public.clients client
     WHERE client.organization_id = NEW.organization_id AND client.id = v_client_id;
    NEW.version_number := 1; NEW.uploaded_by := v_actor;
    NEW.uploaded_by_name := COALESCE(v_name, 'Cliente do portal'); NEW.notes := NULL;
    RETURN NEW;
  END IF;
  IF NOT public.has_org_role(NEW.organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[])
  THEN RAISE EXCEPTION 'DOCUMENT_VERSION_UPLOAD_DENIED'; END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_actor;
  NEW.uploaded_by := v_actor; NEW.uploaded_by_name := COALESCE(v_name, NEW.uploaded_by_name);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_client_portal_document_upload(_upload_intent_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
DECLARE
  v_intent public.client_portal_upload_intents%ROWTYPE;
  v_request public.client_portal_document_requests%ROWTYPE;
  v_document_id uuid;
  v_object record;
  v_client_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_intent FROM public.client_portal_upload_intents
   WHERE id = _upload_intent_id FOR UPDATE;
  IF NOT FOUND OR v_intent.user_id <> auth.uid() THEN RAISE EXCEPTION 'UPLOAD_INTENT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF v_intent.used_at IS NOT NULL OR v_intent.expires_at <= now() THEN RAISE EXCEPTION 'UPLOAD_INTENT_EXPIRED'; END IF;
  SELECT * INTO v_request FROM public.client_portal_document_requests
   WHERE id = v_intent.request_id FOR UPDATE;
  IF v_request.status <> 'pending' THEN RAISE EXCEPTION 'REQUEST_NOT_PENDING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_portal_access access
     WHERE access.organization_id = v_intent.organization_id
       AND access.client_id = v_intent.client_id
       AND access.user_id = auth.uid() AND access.is_active
  ) THEN RAISE EXCEPTION 'PORTAL_ACCESS_INACTIVE' USING ERRCODE = '42501'; END IF;
  SELECT object.owner_id, object.metadata INTO v_object
    FROM storage.objects object
   WHERE object.bucket_id = 'organization-documents' AND object.name = v_intent.file_path;
  IF NOT FOUND OR v_object.owner_id IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'UPLOADED_OBJECT_NOT_FOUND'; END IF;
  IF COALESCE((v_object.metadata->>'size')::bigint, -1) <> v_intent.expected_size
     OR COALESCE(v_object.metadata->>'mimetype', '') <> v_intent.mime_type
  THEN RAISE EXCEPTION 'UPLOADED_OBJECT_MISMATCH'; END IF;

  PERFORM set_config('app.client_portal_upload_intent', v_intent.id::text, true);
  SELECT client.name INTO v_client_name FROM public.clients client
   WHERE client.organization_id = v_intent.organization_id AND client.id = v_intent.client_id;
  INSERT INTO public.documents(
    organization_id, client_id, process_id, title, description, status,
    file_path, original_file_name, stored_file_name, file_extension, mime_type,
    file_size, current_version, uploaded_by, uploaded_by_name
  ) VALUES (
    v_intent.organization_id, v_intent.client_id, v_request.process_id,
    v_request.title, 'Enviado pelo cliente em resposta a uma solicitação do portal.', 'recebido',
    v_intent.file_path, v_intent.original_file_name, v_intent.stored_file_name,
    v_intent.file_extension, v_intent.mime_type, v_intent.expected_size, 1,
    auth.uid(), v_client_name
  ) RETURNING id INTO v_document_id;
  INSERT INTO public.document_versions(
    organization_id, document_id, version_number, file_path, original_file_name,
    stored_file_name, mime_type, file_size, uploaded_by, uploaded_by_name
  ) VALUES (
    v_intent.organization_id, v_document_id, 1, v_intent.file_path,
    v_intent.original_file_name, v_intent.stored_file_name, v_intent.mime_type,
    v_intent.expected_size, auth.uid(), v_client_name
  );
  UPDATE public.client_portal_document_requests
     SET status = 'submitted', submitted_document_id = v_document_id, submitted_at = now()
   WHERE id = v_request.id;
  UPDATE public.client_portal_upload_intents SET used_at = now() WHERE id = v_intent.id;
  INSERT INTO public.client_portal_document_shares(
    organization_id, client_id, document_id, is_shared, shared_by, shared_at
  ) VALUES (
    v_intent.organization_id, v_intent.client_id, v_document_id, true, auth.uid(), now()
  );
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    v_intent.organization_id, auth.uid(), v_client_name, 'client_portal.document_submitted',
    'document', v_document_id,
    jsonb_build_object('client_id', v_intent.client_id, 'request_id', v_request.id,
                       'process_id', v_request.process_id, 'file_name', v_intent.original_file_name)
  );
  RETURN v_document_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_client_portal_document_requests(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_client_portal_document_request(uuid, uuid, uuid, text, text, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_client_portal_document_request_status(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_document_requests() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_client_portal_document_upload(uuid, text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_client_portal_document_upload(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_upload_client_portal_document(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_client_portal_upload_context(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.documents_authorization_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_versions_authorization_guard() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.manage_client_portal_document_requests(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_portal_document_request(uuid, uuid, uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_portal_document_request_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_document_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_client_portal_document_upload(uuid, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_client_portal_document_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_client_portal_document(text) TO authenticated;
