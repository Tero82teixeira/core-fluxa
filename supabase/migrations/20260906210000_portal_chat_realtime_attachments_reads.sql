-- Client Portal chat: private attachments, read receipts and secure realtime signals.

CREATE TABLE public.communication_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  entry_id uuid REFERENCES public.communication_entries(id) ON DELETE SET NULL,
  uploader_id uuid NOT NULL,
  uploader_kind text NOT NULL CHECK (uploader_kind IN ('client','company')),
  file_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL CHECK (char_length(original_file_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size BETWEEN 1 AND 20971520),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_attachments_thread_fkey
    FOREIGN KEY (organization_id, client_id, thread_id)
    REFERENCES public.communication_threads(organization_id, client_id, id) ON DELETE CASCADE
);
CREATE INDEX communication_attachments_thread_idx
  ON public.communication_attachments(organization_id, thread_id, created_at);
ALTER TABLE public.communication_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.communication_attachments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.communication_attachments TO service_role;

CREATE TABLE public.communication_thread_reads (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.communication_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reader_kind text NOT NULL CHECK (reader_kind IN ('client','company')),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, thread_id, user_id, reader_kind)
);
CREATE INDEX communication_thread_reads_lookup_idx
  ON public.communication_thread_reads(organization_id, thread_id, reader_kind, last_read_at DESC);
ALTER TABLE public.communication_thread_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.communication_thread_reads FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.communication_thread_reads TO service_role;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'communication-attachments', 'communication-attachments', false, 20971520,
  ARRAY[
    'application/pdf', 'image/jpeg', 'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
) ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.prepare_communication_attachment_upload(
  _thread_id uuid,
  _original_file_name text,
  _mime_type text,
  _file_size bigint
)
RETURNS TABLE(attachment_id uuid, file_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread public.communication_threads%ROWTYPE;
  v_kind text;
  v_extension text;
  v_expected_mime text;
  v_attachment_id uuid := gen_random_uuid();
  v_path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  SELECT thread.* INTO v_thread
    FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = thread.organization_id
     AND share.client_id = thread.client_id
     AND share.thread_id = thread.id AND share.is_shared
   WHERE thread.id = _thread_id AND thread.archived_at IS NULL;
  IF NOT FOUND OR v_thread.status IN ('resolvida','arquivada') THEN
    RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;

  IF public.has_org_role(
    v_thread.organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
  ) THEN
    v_kind := 'company';
  ELSIF EXISTS (
    SELECT 1 FROM public.client_portal_access access
     WHERE access.organization_id = v_thread.organization_id
       AND access.client_id = v_thread.client_id
       AND access.user_id = auth.uid() AND access.is_active
  ) THEN
    v_kind := 'client';
  ELSE
    RAISE EXCEPTION 'COMMUNICATION_ATTACHMENT_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  IF char_length(COALESCE(_original_file_name, '')) NOT BETWEEN 1 AND 255
     OR _original_file_name ~ '[[:cntrl:]/\\]'
  THEN RAISE EXCEPTION 'INVALID_FILE_NAME'; END IF;
  v_extension := lower(substring(_original_file_name from '\.([^.]+)$'));
  v_expected_mime := CASE v_extension
    WHEN 'pdf' THEN 'application/pdf'
    WHEN 'jpg' THEN 'image/jpeg'
    WHEN 'jpeg' THEN 'image/jpeg'
    WHEN 'png' THEN 'image/png'
    WHEN 'doc' THEN 'application/msword'
    WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN 'xls' THEN 'application/vnd.ms-excel'
    WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ELSE NULL END;
  IF v_expected_mime IS NULL THEN RAISE EXCEPTION 'INVALID_FILE_EXTENSION'; END IF;
  IF _mime_type <> v_expected_mime THEN RAISE EXCEPTION 'INVALID_MIME_TYPE'; END IF;
  IF _file_size NOT BETWEEN 1 AND 20971520 THEN RAISE EXCEPTION 'INVALID_FILE_SIZE'; END IF;

  v_path := v_thread.organization_id::text || '/' || v_thread.id::text || '/' ||
            v_attachment_id::text || '.' || v_extension;
  INSERT INTO public.communication_attachments(
    id, organization_id, client_id, thread_id, uploader_id, uploader_kind,
    file_path, original_file_name, mime_type, file_size
  ) VALUES (
    v_attachment_id, v_thread.organization_id, v_thread.client_id, v_thread.id,
    auth.uid(), v_kind, v_path, _original_file_name, _mime_type, _file_size
  );
  RETURN QUERY SELECT v_attachment_id, v_path;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_communication_attachment(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.communication_attachments attachment
     WHERE attachment.file_path = _file_path
       AND attachment.uploader_id = auth.uid()
       AND attachment.entry_id IS NULL
       AND attachment.completed_at IS NULL
       AND attachment.expires_at > now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_communication_attachment(_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.communication_attachments attachment
      JOIN public.client_portal_communication_shares share
        ON share.organization_id = attachment.organization_id
       AND share.client_id = attachment.client_id
       AND share.thread_id = attachment.thread_id AND share.is_shared
     WHERE attachment.file_path = _file_path AND attachment.completed_at IS NOT NULL
       AND (
         public.has_org_role(
           attachment.organization_id,
           ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
         )
         OR EXISTS (
           SELECT 1 FROM public.client_portal_access access
            WHERE access.organization_id = attachment.organization_id
              AND access.client_id = attachment.client_id
              AND access.user_id = auth.uid() AND access.is_active
         )
       )
  );
$function$;

DROP POLICY IF EXISTS communication_attachments_insert ON storage.objects;
CREATE POLICY communication_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'communication-attachments'
    AND owner_id = (SELECT auth.uid()::text)
    AND public.can_upload_communication_attachment(name)
  );
DROP POLICY IF EXISTS communication_attachments_delete_pending ON storage.objects;
CREATE POLICY communication_attachments_delete_pending ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'communication-attachments'
    AND owner_id = (SELECT auth.uid()::text)
    AND public.can_upload_communication_attachment(name)
  );
DROP POLICY IF EXISTS communication_attachments_select ON storage.objects;
CREATE POLICY communication_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'communication-attachments'
    AND public.can_access_communication_attachment(name)
  );

CREATE OR REPLACE FUNCTION public.finalize_communication_attachment_upload(
  _attachment_id uuid,
  _content text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
DECLARE
  v_attachment public.communication_attachments%ROWTYPE;
  v_thread public.communication_threads%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_entry_id uuid;
  v_content text;
  v_actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_attachment FROM public.communication_attachments attachment
   WHERE attachment.id = _attachment_id AND attachment.uploader_id = auth.uid()
     AND attachment.completed_at IS NULL AND attachment.expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_INTENT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_thread FROM public.communication_threads thread
   WHERE thread.id = v_attachment.thread_id
     AND thread.organization_id = v_attachment.organization_id
     AND thread.archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_thread.status IN ('resolvida','arquivada') THEN
    RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_AVAILABLE' USING ERRCODE = '42501';
  END IF;
  IF v_attachment.uploader_kind = 'company' THEN
    PERFORM public.communication_assert_role(v_attachment.organization_id, false);
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.client_portal_access access
     WHERE access.organization_id = v_attachment.organization_id
       AND access.client_id = v_attachment.client_id
       AND access.user_id = auth.uid() AND access.is_active
  ) THEN RAISE EXCEPTION 'COMMUNICATION_ATTACHMENT_PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;

  SELECT object.* INTO v_object FROM storage.objects object
   WHERE object.bucket_id = 'communication-attachments'
     AND object.name = v_attachment.file_path;
  IF NOT FOUND OR v_object.owner_id IS DISTINCT FROM auth.uid()::text
  THEN RAISE EXCEPTION 'ATTACHMENT_OBJECT_NOT_FOUND'; END IF;
  IF COALESCE(v_object.metadata->>'mimetype', '') <> v_attachment.mime_type
     OR COALESCE(v_object.metadata->>'size', '') !~ '^[0-9]+$'
     OR (v_object.metadata->>'size')::bigint <> v_attachment.file_size
  THEN RAISE EXCEPTION 'ATTACHMENT_OBJECT_MISMATCH'; END IF;

  v_content := NULLIF(btrim(COALESCE(_content, '')), '');
  IF v_content IS NULL THEN v_content := 'Arquivo enviado: ' || v_attachment.original_file_name; END IF;
  IF char_length(v_content) > 5000 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;

  INSERT INTO public.communication_entries(
    organization_id, thread_id, entry_type, content, created_by,
    occurred_at, is_internal, contact_made, metadata
  ) VALUES (
    v_attachment.organization_id, v_attachment.thread_id, 'mensagem', v_content,
    auth.uid(), now(), false, true,
    jsonb_build_object(
      'source', CASE v_attachment.uploader_kind WHEN 'client' THEN 'client_portal' ELSE 'staff_quick_chat' END,
      'author_kind', v_attachment.uploader_kind,
      'attachment_id', v_attachment.id,
      'attachment_path', v_attachment.file_path,
      'attachment_name', v_attachment.original_file_name,
      'attachment_mime_type', v_attachment.mime_type,
      'attachment_size', v_attachment.file_size
    )
  ) RETURNING id INTO v_entry_id;
  UPDATE public.communication_attachments
     SET entry_id = v_entry_id, completed_at = now()
   WHERE id = v_attachment.id;
  IF v_attachment.uploader_kind = 'client' THEN
    UPDATE public.communication_threads SET status = 'aguardando_equipe', updated_at = now()
     WHERE id = v_attachment.thread_id;
  END IF;
  SELECT COALESCE(profile.full_name, client.name)
    INTO v_actor_name
    FROM public.clients client
    LEFT JOIN public.profiles profile ON profile.id = auth.uid()
   WHERE client.organization_id = v_attachment.organization_id
     AND client.id = v_attachment.client_id;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    v_attachment.organization_id, auth.uid(), v_actor_name,
    CASE v_attachment.uploader_kind
      WHEN 'client' THEN 'client_portal.communication_attachment_added'
      ELSE 'communication.attachment_added'
    END,
    'communication_thread', v_attachment.thread_id,
    jsonb_build_object(
      'entry_id', v_entry_id,
      'attachment_id', v_attachment.id,
      'file_name', v_attachment.original_file_name,
      'file_size', v_attachment.file_size
    )
  );
  RETURN v_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_client_portal_communication_read(_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT thread.organization_id INTO v_org
    FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = thread.organization_id AND share.client_id = thread.client_id
     AND share.thread_id = thread.id AND share.is_shared
    JOIN public.client_portal_access access
      ON access.organization_id = thread.organization_id AND access.client_id = thread.client_id
     AND access.user_id = auth.uid() AND access.is_active
   WHERE thread.id = _thread_id AND thread.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.communication_thread_reads(organization_id, thread_id, user_id, reader_kind, last_read_at)
  VALUES (v_org, _thread_id, auth.uid(), 'client', now())
  ON CONFLICT (organization_id, thread_id, user_id, reader_kind)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_staff_portal_communication_read(
  _organization_id uuid,
  _thread_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  IF NOT EXISTS (
    SELECT 1 FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = thread.organization_id AND share.client_id = thread.client_id
     AND share.thread_id = thread.id AND share.is_shared
    WHERE thread.organization_id = _organization_id AND thread.id = _thread_id
      AND thread.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.communication_thread_reads(organization_id, thread_id, user_id, reader_kind, last_read_at)
  VALUES (_organization_id, _thread_id, auth.uid(), 'company', now())
  ON CONFLICT (organization_id, thread_id, user_id, reader_kind)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at;
END;
$function$;

DROP FUNCTION public.client_portal_communication_entries(uuid);
CREATE FUNCTION public.client_portal_communication_entries(_thread_id uuid)
RETURNS TABLE(
  entry_id uuid, content text, author_kind text, occurred_at timestamptz,
  read_at timestamptz, attachment_id uuid, attachment_path text,
  attachment_name text, attachment_mime_type text, attachment_size bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT entry.id, entry.content,
         CASE WHEN entry.metadata->>'source' = 'client_portal' THEN 'client' ELSE 'company' END,
         entry.occurred_at,
         (SELECT max(reads.last_read_at) FROM public.communication_thread_reads reads
           WHERE reads.organization_id = entry.organization_id AND reads.thread_id = entry.thread_id
             AND reads.reader_kind = CASE WHEN entry.metadata->>'source' = 'client_portal' THEN 'company' ELSE 'client' END
             AND reads.last_read_at >= entry.occurred_at),
         attachment.id, attachment.file_path, attachment.original_file_name,
         attachment.mime_type, attachment.file_size
    FROM public.client_portal_access access
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = access.organization_id AND share.client_id = access.client_id
     AND share.thread_id = _thread_id AND share.is_shared
    JOIN public.communication_threads thread
      ON thread.organization_id = share.organization_id AND thread.client_id = share.client_id
     AND thread.id = share.thread_id AND thread.archived_at IS NULL
    JOIN public.communication_entries entry
      ON entry.organization_id = thread.organization_id AND entry.thread_id = thread.id
     AND entry.entry_type = 'mensagem' AND NOT entry.is_internal
    LEFT JOIN public.communication_attachments attachment
      ON attachment.entry_id = entry.id AND attachment.completed_at IS NOT NULL
   WHERE access.user_id = auth.uid() AND access.is_active
   ORDER BY entry.occurred_at, entry.created_at, entry.id;
$function$;

CREATE OR REPLACE FUNCTION public.staff_client_portal_communication_entries(
  _organization_id uuid,
  _thread_id uuid
)
RETURNS TABLE(
  entry_id uuid, content text, author_kind text, occurred_at timestamptz,
  read_at timestamptz, attachment_id uuid, attachment_path text,
  attachment_name text, attachment_mime_type text, attachment_size bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  RETURN QUERY
  SELECT entry.id, entry.content,
         CASE WHEN entry.metadata->>'source' = 'client_portal' THEN 'client' ELSE 'company' END,
         entry.occurred_at,
         (SELECT max(reads.last_read_at) FROM public.communication_thread_reads reads
           WHERE reads.organization_id = entry.organization_id AND reads.thread_id = entry.thread_id
             AND reads.reader_kind = CASE WHEN entry.metadata->>'source' = 'client_portal' THEN 'company' ELSE 'client' END
             AND reads.last_read_at >= entry.occurred_at),
         attachment.id, attachment.file_path, attachment.original_file_name,
         attachment.mime_type, attachment.file_size
    FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = thread.organization_id AND share.client_id = thread.client_id
     AND share.thread_id = thread.id AND share.is_shared
    JOIN public.communication_entries entry
      ON entry.organization_id = thread.organization_id AND entry.thread_id = thread.id
     AND entry.entry_type = 'mensagem' AND NOT entry.is_internal
    LEFT JOIN public.communication_attachments attachment
      ON attachment.entry_id = entry.id AND attachment.completed_at IS NOT NULL
   WHERE thread.organization_id = _organization_id AND thread.id = _thread_id
     AND thread.archived_at IS NULL
   ORDER BY entry.occurred_at, entry.created_at, entry.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.broadcast_portal_chat_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'realtime', 'pg_temp'
AS $function$
DECLARE v_client_id uuid; v_access record;
BEGIN
  SELECT thread.client_id INTO v_client_id
    FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = thread.organization_id
     AND share.client_id = thread.client_id
     AND share.thread_id = thread.id AND share.is_shared
   WHERE thread.organization_id = NEW.organization_id AND thread.id = NEW.thread_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM realtime.send(
    jsonb_build_object('thread_id', NEW.thread_id), 'message',
    'staff-org:' || NEW.organization_id::text, true
  );
  FOR v_access IN
    SELECT access.user_id FROM public.client_portal_access access
     WHERE access.organization_id = NEW.organization_id AND access.client_id = v_client_id
       AND access.is_active
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('thread_id', NEW.thread_id), 'message',
      'portal-user:' || v_access.user_id::text, true
    );
  END LOOP;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER communication_entries_portal_broadcast
  AFTER INSERT ON public.communication_entries
  FOR EACH ROW WHEN (NEW.entry_type = 'mensagem' AND NOT NEW.is_internal)
  EXECUTE FUNCTION public.broadcast_portal_chat_change();
CREATE TRIGGER communication_reads_portal_broadcast
  AFTER INSERT OR UPDATE ON public.communication_thread_reads
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_portal_chat_change();

DROP POLICY IF EXISTS portal_chat_broadcast_select ON realtime.messages;
CREATE POLICY portal_chat_broadcast_select ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast' AND (
    realtime.topic() = 'portal-user:' || auth.uid()::text
    OR CASE
      WHEN realtime.topic() ~ '^staff-org:[0-9a-fA-F-]{36}$' THEN
        public.has_org_role(
          substring(realtime.topic() from 11)::uuid,
          ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
        )
      ELSE false
    END
  )
);

REVOKE ALL ON FUNCTION public.prepare_communication_attachment_upload(uuid,text,text,bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_upload_communication_attachment(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_communication_attachment(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_communication_attachment_upload(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_client_portal_communication_read(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_staff_portal_communication_read(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_communication_entries(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_client_portal_communication_entries(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.broadcast_portal_chat_change()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.prepare_communication_attachment_upload(uuid,text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_communication_attachment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_communication_attachment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_communication_attachment_upload(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_client_portal_communication_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_staff_portal_communication_read(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_communication_entries(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_client_portal_communication_entries(uuid,uuid) TO authenticated;
