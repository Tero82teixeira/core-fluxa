-- Staff quick inbox for conversations explicitly shared with the Client Portal.
-- It exposes no new client capability and reuses the internal communication
-- permission gate for owners, administrators, managers and operational staff.

CREATE OR REPLACE FUNCTION public.staff_client_portal_inbox(_organization_id uuid)
RETURNS TABLE(
  thread_id uuid,
  client_id uuid,
  client_name text,
  subject text,
  status text,
  priority text,
  assigned_to uuid,
  opened_by_client boolean,
  last_message text,
  last_message_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);

  RETURN QUERY
  SELECT
    thread.id,
    thread.client_id,
    client.name,
    thread.subject,
    thread.status::text,
    thread.priority::text,
    thread.assigned_to,
    share.opened_by_client,
    last_entry.content,
    last_entry.occurred_at,
    thread.updated_at
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
    SELECT entry.content, entry.occurred_at
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
  ORDER BY
    CASE thread.status
      WHEN 'aguardando_equipe' THEN 0
      WHEN 'aberta' THEN 1
      WHEN 'aguardando_cliente' THEN 2
      WHEN 'resolvida' THEN 3
      ELSE 4
    END,
    COALESCE(last_entry.occurred_at, thread.updated_at) DESC,
    thread.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_client_portal_inbox(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_client_portal_inbox(uuid) TO authenticated;
