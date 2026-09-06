-- Unified internal service center for activity that belongs to the Client Portal.
-- Communication roles receive only explicitly shared conversations. Document
-- request metadata is added only for owners and administrators, matching the
-- existing portal-management boundary.

CREATE OR REPLACE FUNCTION public.staff_client_portal_service_center(
  _organization_id uuid
)
RETURNS TABLE(
  item_kind text,
  item_id uuid,
  client_id uuid,
  client_name text,
  title text,
  status text,
  priority text,
  assigned_to uuid,
  due_date date,
  last_activity_at timestamptz,
  unread_count bigint,
  opened_by_client boolean,
  process_code text,
  submitted_file_name text,
  requires_action boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_can_review_documents boolean;
  v_today date;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  v_can_review_documents := public.has_org_role(
    _organization_id,
    ARRAY['proprietario','administrador']::public.app_role[]
  );
  SELECT (
    now() AT TIME ZONE CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_catalog.pg_timezone_names zone
         WHERE zone.name = settings.timezone
      ) THEN settings.timezone
      ELSE 'America/Sao_Paulo'
    END
  )::date
    INTO v_today
    FROM public.organizations organization
    LEFT JOIN public.organization_settings settings
      ON settings.organization_id = organization.id
   WHERE organization.id = _organization_id;

  RETURN QUERY
  WITH portal_items AS (
    SELECT
      'communication'::text AS item_kind,
      thread.id AS item_id,
      thread.client_id,
      client.name AS client_name,
      thread.subject AS title,
      thread.status::text AS status,
      thread.priority::text AS priority,
      thread.assigned_to,
      NULL::date AS due_date,
      COALESCE(last_entry.occurred_at, thread.updated_at) AS last_activity_at,
      (
        SELECT count(*)::bigint
          FROM public.communication_entries unread
         WHERE unread.organization_id = thread.organization_id
           AND unread.thread_id = thread.id
           AND unread.entry_type = 'mensagem'
           AND NOT unread.is_internal
           AND unread.metadata->>'source' = 'client_portal'
           AND unread.occurred_at > COALESCE((
             SELECT max(reads.last_read_at)
               FROM public.communication_thread_reads reads
              WHERE reads.organization_id = thread.organization_id
                AND reads.thread_id = thread.id
                AND reads.user_id = auth.uid()
                AND reads.reader_kind = 'company'
           ), '-infinity'::timestamptz)
      ) AS unread_count,
      share.opened_by_client,
      NULL::text AS process_code,
      NULL::text AS submitted_file_name,
      thread.status = 'aguardando_equipe' AS requires_action
      FROM public.client_portal_communication_shares share
      JOIN public.communication_threads thread
        ON thread.organization_id = share.organization_id
       AND thread.client_id = share.client_id
       AND thread.id = share.thread_id
       AND thread.archived_at IS NULL
      JOIN public.clients client
        ON client.organization_id = thread.organization_id
       AND client.id = thread.client_id
       AND client.archived_at IS NULL
      LEFT JOIN LATERAL (
        SELECT entry.occurred_at
          FROM public.communication_entries entry
         WHERE entry.organization_id = thread.organization_id
           AND entry.thread_id = thread.id
           AND entry.entry_type = 'mensagem'
           AND NOT entry.is_internal
         ORDER BY entry.occurred_at DESC, entry.created_at DESC, entry.id DESC
         LIMIT 1
      ) last_entry ON true
     WHERE share.organization_id = _organization_id
       AND share.is_shared

    UNION ALL

    SELECT
      'document_request'::text,
      request.id,
      request.client_id,
      client.name,
      request.title,
      request.status,
      CASE
        WHEN request.status = 'submitted' OR request.due_date < v_today THEN 'urgente'
        WHEN request.status = 'revision_requested' THEN 'alta'
        ELSE 'normal'
      END,
      NULL::uuid,
      request.due_date,
      request.updated_at,
      0::bigint,
      false,
      process.code,
      document.original_file_name,
      request.status = 'submitted'
      FROM public.client_portal_document_requests request
      JOIN public.clients client
        ON client.organization_id = request.organization_id
       AND client.id = request.client_id
       AND client.archived_at IS NULL
      LEFT JOIN public.processes process
        ON process.organization_id = request.organization_id
       AND process.client_id = request.client_id
       AND process.id = request.process_id
      LEFT JOIN public.documents document
        ON document.organization_id = request.organization_id
       AND document.client_id = request.client_id
       AND document.id = request.submitted_document_id
     WHERE v_can_review_documents
       AND request.organization_id = _organization_id
       AND request.status IN ('pending','submitted','revision_requested')
  )
  SELECT item.*
    FROM portal_items item
   ORDER BY
     CASE
       WHEN item.requires_action AND item.item_kind = 'communication' THEN 0
       WHEN item.requires_action AND item.item_kind = 'document_request' THEN 1
       WHEN item.unread_count > 0 THEN 2
       WHEN item.item_kind = 'document_request' AND item.due_date < v_today THEN 3
       WHEN item.item_kind = 'communication' AND item.status = 'aberta' THEN 4
       ELSE 5
     END,
     item.last_activity_at DESC,
     item.item_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_client_portal_service_center(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_client_portal_service_center(uuid) TO authenticated;
