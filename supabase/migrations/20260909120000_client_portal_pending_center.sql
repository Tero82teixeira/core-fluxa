-- Client Portal: complete document-request review and resubmission workflow.

ALTER TABLE public.client_portal_document_requests
  ADD COLUMN IF NOT EXISTS company_feedback text,
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_by uuid,
  ADD COLUMN IF NOT EXISTS submission_count integer NOT NULL DEFAULT 0;

UPDATE public.client_portal_document_requests
   SET submission_count = 1
 WHERE status IN ('submitted', 'completed')
   AND submission_count = 0;

ALTER TABLE public.client_portal_document_requests
  DROP CONSTRAINT IF EXISTS client_portal_document_requests_status_check,
  DROP CONSTRAINT IF EXISTS client_portal_document_requests_submission_consistency;

ALTER TABLE public.client_portal_document_requests
  ADD CONSTRAINT client_portal_document_requests_status_check
    CHECK (status IN ('pending', 'submitted', 'revision_requested', 'completed', 'cancelled')),
  ADD CONSTRAINT client_portal_document_requests_feedback_check
    CHECK (company_feedback IS NULL OR char_length(btrim(company_feedback)) BETWEEN 1 AND 2000),
  ADD CONSTRAINT client_portal_document_requests_submission_count_check
    CHECK (submission_count >= 0),
  ADD CONSTRAINT client_portal_document_requests_submission_consistency
    CHECK (
      (status = 'pending' AND completed_at IS NULL AND cancelled_at IS NULL)
      OR (status = 'submitted' AND submitted_document_id IS NOT NULL AND submitted_at IS NOT NULL
        AND completed_at IS NULL AND cancelled_at IS NULL)
      OR (status = 'revision_requested' AND submitted_document_id IS NOT NULL
        AND submitted_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL
        AND company_feedback IS NOT NULL AND feedback_at IS NOT NULL AND feedback_by IS NOT NULL)
      OR (status = 'completed' AND submitted_document_id IS NOT NULL AND submitted_at IS NOT NULL
        AND completed_at IS NOT NULL AND cancelled_at IS NULL)
      OR (status = 'cancelled' AND completed_at IS NULL AND cancelled_at IS NOT NULL)
    );

CREATE OR REPLACE FUNCTION public.track_client_portal_document_submission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'pending' THEN
    NEW.submission_count := OLD.submission_count + 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS client_portal_document_request_track_submission
  ON public.client_portal_document_requests;
CREATE TRIGGER client_portal_document_request_track_submission
  BEFORE UPDATE OF status ON public.client_portal_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.track_client_portal_document_submission();

DROP FUNCTION IF EXISTS public.manage_client_portal_document_requests(uuid, uuid);
CREATE FUNCTION public.manage_client_portal_document_requests(
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
  company_feedback text,
  feedback_at timestamptz,
  submission_count integer,
  updated_at timestamptz,
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
         request.submitted_at, request.company_feedback, request.feedback_at,
         request.submission_count, request.updated_at, request.created_at
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
   ORDER BY CASE request.status
              WHEN 'revision_requested' THEN 0 WHEN 'pending' THEN 1
              WHEN 'submitted' THEN 2 ELSE 3 END,
            request.due_date NULLS LAST, request.updated_at DESC;
END;
$function$;

DROP FUNCTION IF EXISTS public.client_portal_document_requests();
CREATE FUNCTION public.client_portal_document_requests()
RETURNS TABLE(
  access_id uuid,
  request_id uuid,
  organization_name text,
  client_name text,
  process_id uuid,
  process_code text,
  title text,
  description text,
  due_date date,
  status text,
  submitted_document_id uuid,
  submitted_file_name text,
  submitted_at timestamptz,
  company_feedback text,
  feedback_at timestamptz,
  submission_count integer,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT access.id, request.id, organization.legal_name, client.name,
         request.process_id, process.code, request.title, request.description,
         request.due_date, request.status, request.submitted_document_id,
         document.original_file_name, request.submitted_at,
         request.company_feedback, request.feedback_at, request.submission_count,
         request.updated_at, request.created_at
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
   ORDER BY CASE request.status
              WHEN 'revision_requested' THEN 0 WHEN 'pending' THEN 1
              WHEN 'submitted' THEN 2 ELSE 3 END,
            request.due_date NULLS LAST, request.updated_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.review_client_portal_document_request(
  _request_id uuid,
  _decision text,
  _feedback text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_request public.client_portal_document_requests%ROWTYPE;
  v_actor_name text;
  v_feedback text := NULLIF(btrim(COALESCE(_feedback, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_request FROM public.client_portal_document_requests
   WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF NOT public.has_org_role(v_request.organization_id, ARRAY['proprietario','administrador']::public.app_role[])
  THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  IF v_request.status <> 'submitted' THEN RAISE EXCEPTION 'REQUEST_NOT_SUBMITTED'; END IF;
  IF char_length(COALESCE(v_feedback, '')) > 2000 THEN RAISE EXCEPTION 'INVALID_FEEDBACK'; END IF;

  IF _decision = 'completed' THEN
    UPDATE public.client_portal_document_requests
       SET status = 'completed', completed_by = auth.uid(), completed_at = now(),
           company_feedback = v_feedback,
           feedback_at = CASE WHEN v_feedback IS NULL THEN NULL ELSE now() END,
           feedback_by = CASE WHEN v_feedback IS NULL THEN NULL ELSE auth.uid() END
     WHERE id = _request_id;
  ELSIF _decision = 'revision_requested' AND v_feedback IS NOT NULL THEN
    UPDATE public.client_portal_document_requests
       SET status = 'revision_requested', company_feedback = v_feedback,
           feedback_at = now(), feedback_by = auth.uid()
     WHERE id = _request_id;
  ELSE
    RAISE EXCEPTION 'INVALID_REVIEW_DECISION';
  END IF;

  SELECT profile.full_name INTO v_actor_name FROM public.profiles profile WHERE profile.id = auth.uid();
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    v_request.organization_id, auth.uid(), v_actor_name,
    CASE _decision WHEN 'completed' THEN 'client_portal.document_request_completed'
                   ELSE 'client_portal.document_request_revision_requested' END,
    'client_portal_document_request', _request_id,
    jsonb_build_object('client_id', v_request.client_id, 'from', v_request.status,
                       'to', _decision, 'feedback', v_feedback)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_client_portal_document_resubmission(
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  PERFORM 1
    FROM public.client_portal_document_requests request
    JOIN public.client_portal_access access
      ON access.organization_id = request.organization_id
     AND access.client_id = request.client_id
     AND access.user_id = auth.uid() AND access.is_active
   WHERE request.id = _request_id AND request.status = 'revision_requested'
   FOR UPDATE OF request;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVISION_REQUEST_NOT_FOUND' USING ERRCODE = '42501'; END IF;

  UPDATE public.client_portal_document_requests
     SET status = 'pending'
   WHERE id = _request_id AND status = 'revision_requested';

  RETURN QUERY
  SELECT prepared.upload_intent_id, prepared.file_path
    FROM public.prepare_client_portal_document_upload(
      _request_id, _original_file_name, _mime_type, _file_size
    ) prepared;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_client_portal_document_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_client_portal_notification(
      NEW.organization_id, NEW.client_id, 'document_request', 'Novo documento solicitado', NEW.title,
      'document_request', NEW.id, 'document-request:' || NEW.id
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('revision_requested', 'completed', 'cancelled') THEN
    PERFORM public.enqueue_client_portal_notification(
      NEW.organization_id, NEW.client_id, 'document_request',
      CASE NEW.status
        WHEN 'revision_requested' THEN 'Correção solicitada'
        WHEN 'completed' THEN 'Documento aprovado pela empresa'
        ELSE 'Solicitação cancelada' END,
      CASE WHEN NEW.status = 'revision_requested'
        THEN COALESCE(NEW.company_feedback, NEW.title) ELSE NEW.title END,
      'document_request', NEW.id,
      'document-request-status:' || NEW.id || ':' || NEW.status || ':' || NEW.submission_count
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.track_client_portal_document_submission()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.manage_client_portal_document_requests(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_document_requests()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_client_portal_document_request(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_client_portal_document_resubmission(uuid, text, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_client_portal_document_request()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.manage_client_portal_document_requests(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_document_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_client_portal_document_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_client_portal_document_resubmission(uuid, text, text, bigint) TO authenticated;
