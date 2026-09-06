-- Secure one-click claiming for unassigned conversations shown in the
-- staff Client Portal service center.

CREATE OR REPLACE FUNCTION public.claim_portal_communication_thread(
  _thread_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  target_thread public.communication_threads%ROWTYPE;
BEGIN
  SELECT thread.*
    INTO target_thread
    FROM public.communication_threads AS thread
   WHERE thread.id = _thread_id
     AND public.is_org_member(thread.organization_id)
     AND thread.assigned_to IS NULL
     AND thread.archived_at IS NULL
     AND thread.status::text IN (
       'aberta', 'aguardando_cliente', 'aguardando_equipe'
     )
     AND EXISTS (
       SELECT 1
         FROM public.client_portal_communication_shares AS share
        WHERE share.organization_id = thread.organization_id
          AND share.client_id = thread.client_id
          AND share.thread_id = thread.id
          AND share.is_shared
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PORTAL_COMMUNICATION_NOT_AVAILABLE_FOR_CLAIM';
  END IF;

  PERFORM public.communication_assert_role(
    target_thread.organization_id,
    false
  );

  UPDATE public.communication_threads
     SET assigned_to = auth.uid(),
         updated_at = now()
   WHERE id = target_thread.id
     AND organization_id = target_thread.organization_id
     AND assigned_to IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PORTAL_COMMUNICATION_NOT_AVAILABLE_FOR_CLAIM';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    target_thread.organization_id,
    auth.uid(),
    'communication.assignee.claimed',
    'communication_thread',
    target_thread.id,
    jsonb_build_object('assigned_to', auth.uid(), 'source', 'portal_triage')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_portal_communication_thread(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_portal_communication_thread(uuid)
  TO authenticated;
