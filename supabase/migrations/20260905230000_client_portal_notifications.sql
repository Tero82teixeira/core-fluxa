-- Client Portal, stage 6: client-safe notifications.
-- Internal notifications remain private. Portal notifications are generated only
-- from explicitly shared content, document requests and public company messages.

CREATE TABLE public.client_portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('process','document','document_request','communication','system')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  body text CHECK (body IS NULL OR char_length(body) <= 1000),
  entity_type text CHECK (entity_type IS NULL OR entity_type IN ('process','document','document_request','communication')),
  entity_id uuid,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_notifications_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX client_portal_notifications_lookup_idx
  ON public.client_portal_notifications(organization_id, client_id, created_at DESC);
CREATE INDEX client_portal_notifications_unread_idx
  ON public.client_portal_notifications(organization_id, client_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE UNIQUE INDEX client_portal_notifications_dedupe_key
  ON public.client_portal_notifications(organization_id, client_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.client_portal_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_portal_notifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_portal_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_client_portal_notification(
  _organization_id uuid,
  _client_id uuid,
  _kind text,
  _title text,
  _body text,
  _entity_type text,
  _entity_id uuid,
  _dedupe_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.client_portal_notifications(
    organization_id, client_id, kind, title, body, entity_type, entity_id, dedupe_key
  ) VALUES (
    _organization_id, _client_id, _kind, btrim(_title), NULLIF(btrim(COALESCE(_body, '')), ''),
    _entity_type, _entity_id, _dedupe_key
  ) ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_client_portal_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_title text;
BEGIN
  IF NOT NEW.is_shared OR (TG_OP = 'UPDATE' AND OLD.is_shared) THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'client_portal_process_shares' THEN
    SELECT COALESCE(NULLIF(process.title, ''), process.code) INTO v_title
      FROM public.processes process
     WHERE process.organization_id = NEW.organization_id
       AND process.client_id = NEW.client_id AND process.id = NEW.process_id;
    PERFORM public.enqueue_client_portal_notification(
      NEW.organization_id, NEW.client_id, 'process', 'Novo processo compartilhado', v_title,
      'process', NEW.process_id, 'process-share:' || NEW.id || ':' || NEW.shared_at
    );
  ELSIF TG_TABLE_NAME = 'client_portal_document_shares' THEN
    SELECT document.title INTO v_title
      FROM public.documents document
     WHERE document.organization_id = NEW.organization_id
       AND document.client_id = NEW.client_id AND document.id = NEW.document_id;
    PERFORM public.enqueue_client_portal_notification(
      NEW.organization_id, NEW.client_id, 'document', 'Novo documento compartilhado', v_title,
      'document', NEW.document_id, 'document-share:' || NEW.id || ':' || NEW.shared_at
    );
  ELSIF TG_TABLE_NAME = 'client_portal_communication_shares' AND NOT NEW.opened_by_client THEN
    SELECT thread.subject INTO v_title
      FROM public.communication_threads thread
     WHERE thread.organization_id = NEW.organization_id
       AND thread.client_id = NEW.client_id AND thread.id = NEW.thread_id;
    PERFORM public.enqueue_client_portal_notification(
      NEW.organization_id, NEW.client_id, 'communication', 'Nova conversa disponível', v_title,
      'communication', NEW.thread_id, 'communication-share:' || NEW.id || ':' || NEW.shared_at
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER client_portal_process_share_notify
  AFTER INSERT OR UPDATE OF is_shared ON public.client_portal_process_shares
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_share();
CREATE TRIGGER client_portal_document_share_notify
  AFTER INSERT OR UPDATE OF is_shared ON public.client_portal_document_shares
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_share();
CREATE TRIGGER client_portal_communication_share_notify
  AFTER INSERT OR UPDATE OF is_shared ON public.client_portal_communication_shares
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_share();

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
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('completed','cancelled') THEN
    PERFORM public.enqueue_client_portal_notification(
      NEW.organization_id, NEW.client_id, 'document_request',
      CASE NEW.status WHEN 'completed' THEN 'Documento recebido pela empresa' ELSE 'Solicitação cancelada' END,
      NEW.title, 'document_request', NEW.id, 'document-request-status:' || NEW.id || ':' || NEW.status
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER client_portal_document_request_notify
  AFTER INSERT OR UPDATE OF status ON public.client_portal_document_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_document_request();

CREATE OR REPLACE FUNCTION public.notify_client_portal_process_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_title text;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date
  THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_portal_process_shares share
     WHERE share.organization_id = NEW.organization_id AND share.client_id = NEW.client_id
       AND share.process_id = NEW.id AND share.is_shared
  ) THEN RETURN NEW; END IF;
  v_title := COALESCE(NULLIF(NEW.title, ''), NEW.code);
  PERFORM public.enqueue_client_portal_notification(
    NEW.organization_id, NEW.client_id, 'process', 'Processo atualizado', v_title,
    'process', NEW.id, 'process-update:' || NEW.id || ':' || NEW.updated_at
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER client_portal_process_update_notify
  AFTER UPDATE OF stage, due_date ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_process_update();

CREATE OR REPLACE FUNCTION public.notify_client_portal_company_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_thread public.communication_threads%ROWTYPE;
BEGIN
  IF NEW.entry_type <> 'mensagem' OR NEW.is_internal
     OR COALESCE(NEW.metadata->>'source', '') = 'client_portal'
  THEN RETURN NEW; END IF;

  SELECT thread.* INTO v_thread
    FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = thread.organization_id
     AND share.client_id = thread.client_id AND share.thread_id = thread.id AND share.is_shared
   WHERE thread.organization_id = NEW.organization_id AND thread.id = NEW.thread_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  PERFORM public.enqueue_client_portal_notification(
    v_thread.organization_id, v_thread.client_id, 'communication',
    'Nova mensagem da empresa', v_thread.subject,
    'communication', v_thread.id, 'communication-entry:' || NEW.id
  );
  IF v_thread.status NOT IN ('resolvida','arquivada') THEN
    UPDATE public.communication_threads
       SET status = 'aguardando_cliente', updated_at = now()
     WHERE id = v_thread.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER client_portal_company_message_notify
  AFTER INSERT ON public.communication_entries
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_company_message();

CREATE OR REPLACE FUNCTION public.client_portal_notifications()
RETURNS TABLE(
  access_id uuid,
  notification_id uuid,
  organization_name text,
  client_name text,
  kind text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT access.id, notification.id, organization.legal_name, client.name,
         notification.kind, notification.title, notification.body,
         notification.entity_type, notification.entity_id,
         notification.read_at, notification.created_at
    FROM public.client_portal_access access
    JOIN public.organizations organization
      ON organization.id = access.organization_id AND organization.archived_at IS NULL
    JOIN public.clients client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id AND client.archived_at IS NULL
    JOIN public.client_portal_notifications notification
      ON notification.organization_id = access.organization_id
     AND notification.client_id = access.client_id
   WHERE access.user_id = auth.uid() AND access.is_active
     AND CASE notification.entity_type
       WHEN 'process' THEN EXISTS (
         SELECT 1 FROM public.client_portal_process_shares share
          WHERE share.organization_id = notification.organization_id
            AND share.client_id = notification.client_id
            AND share.process_id = notification.entity_id AND share.is_shared)
       WHEN 'document' THEN EXISTS (
         SELECT 1 FROM public.client_portal_document_shares share
          WHERE share.organization_id = notification.organization_id
            AND share.client_id = notification.client_id
            AND share.document_id = notification.entity_id AND share.is_shared)
       WHEN 'communication' THEN EXISTS (
         SELECT 1 FROM public.client_portal_communication_shares share
          WHERE share.organization_id = notification.organization_id
            AND share.client_id = notification.client_id
            AND share.thread_id = notification.entity_id AND share.is_shared)
       WHEN 'document_request' THEN EXISTS (
         SELECT 1 FROM public.client_portal_document_requests request
          WHERE request.organization_id = notification.organization_id
            AND request.client_id = notification.client_id AND request.id = notification.entity_id)
       ELSE true
     END
   ORDER BY notification.created_at DESC, notification.id DESC
   LIMIT 100;
$function$;

CREATE OR REPLACE FUNCTION public.mark_client_portal_notification_read(_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  UPDATE public.client_portal_notifications notification
     SET read_at = COALESCE(notification.read_at, now())
   WHERE notification.id = _notification_id
     AND EXISTS (
       SELECT 1 FROM public.client_portal_access access
        WHERE access.organization_id = notification.organization_id
          AND access.client_id = notification.client_id
          AND access.user_id = auth.uid() AND access.is_active
     );
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_all_client_portal_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000'; END IF;
  UPDATE public.client_portal_notifications notification SET read_at = now()
   WHERE notification.read_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.client_portal_access access
        WHERE access.organization_id = notification.organization_id
          AND access.client_id = notification.client_id
          AND access.user_id = auth.uid() AND access.is_active
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_client_portal_notification(uuid, uuid, text, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_client_portal_share() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_client_portal_document_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_client_portal_process_update() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_client_portal_company_message() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_notifications() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_client_portal_notification_read(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_all_client_portal_notifications_read() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.client_portal_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_client_portal_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_client_portal_notifications_read() TO authenticated;
