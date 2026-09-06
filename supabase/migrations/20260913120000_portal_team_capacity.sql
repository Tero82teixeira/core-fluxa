-- Availability and capacity controls for automatic Client Portal assignment.
-- Existing eligible staff remain enabled so the opt-in organization setting
-- introduced in the previous migration keeps its current behavior.

ALTER TABLE public.organization_members
  ADD COLUMN receives_portal_communications boolean NOT NULL DEFAULT false,
  ADD COLUMN portal_communication_capacity integer NOT NULL DEFAULT 20,
  ADD COLUMN last_portal_communication_assigned_at timestamptz;

UPDATE public.organization_members
SET receives_portal_communications = true
WHERE is_active
  AND role::text IN (
    'superadmin', 'proprietario', 'administrador', 'gestor', 'operacional'
  );

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_portal_communication_capacity_range
    CHECK (portal_communication_capacity BETWEEN 1 AND 500);

CREATE INDEX organization_members_portal_communication_distribution_idx
  ON public.organization_members(
    organization_id,
    last_portal_communication_assigned_at,
    user_id
  )
  WHERE is_active AND receives_portal_communications;

CREATE OR REPLACE FUNCTION public.update_member_portal_communication_distribution(
  _member uuid,
  _capacity integer,
  _receives_portal_communications boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  target_member public.organization_members%ROWTYPE;
BEGIN
  SELECT member.*
    INTO target_member
    FROM public.organization_members AS member
   WHERE member.id = _member
   FOR UPDATE;

  IF NOT FOUND OR NOT public.automation_can_manage(target_member.organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _capacity IS NULL OR _capacity NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'INVALID_CAPACITY';
  END IF;
  IF _receives_portal_communications
     AND target_member.role::text NOT IN (
       'superadmin', 'proprietario', 'administrador', 'gestor', 'operacional'
     ) THEN
    RAISE EXCEPTION 'ROLE_NOT_ELIGIBLE';
  END IF;

  UPDATE public.organization_members
     SET portal_communication_capacity = _capacity,
         receives_portal_communications = _receives_portal_communications,
         updated_at = now()
   WHERE id = target_member.id
     AND organization_id = target_member.organization_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    target_member.organization_id,
    auth.uid(),
    'member.portal_communication_distribution_updated',
    'member',
    target_member.id,
    jsonb_build_object(
      'capacity', _capacity,
      'enabled', _receives_portal_communications
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.select_portal_communication_assignee(
  _organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  selected_user_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.organization_settings AS settings
     WHERE settings.organization_id = _organization_id
       AND settings.auto_assign_portal_communications
  ) THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('portal-communication-assignment:' || _organization_id::text, 0)
  );

  SELECT member.user_id
    INTO selected_user_id
    FROM public.organization_members AS member
    CROSS JOIN LATERAL (
      SELECT count(thread.id)::integer AS open_threads
        FROM public.communication_threads AS thread
       WHERE thread.organization_id = member.organization_id
         AND thread.assigned_to = member.user_id
         AND thread.archived_at IS NULL
         AND thread.status::text IN (
           'aberta', 'aguardando_cliente', 'aguardando_equipe'
         )
    ) AS workload
   WHERE member.organization_id = _organization_id
     AND member.is_active
     AND member.receives_portal_communications
     AND member.role::text IN (
       'superadmin', 'proprietario', 'administrador', 'gestor', 'operacional'
     )
     AND workload.open_threads < member.portal_communication_capacity
   ORDER BY
     CASE WHEN member.role::text IN ('gestor', 'operacional') THEN 0 ELSE 1 END,
     workload.open_threads::numeric / member.portal_communication_capacity,
     workload.open_threads,
     member.last_portal_communication_assigned_at NULLS FIRST,
     member.user_id
   LIMIT 1;

  IF selected_user_id IS NOT NULL THEN
    UPDATE public.organization_members
       SET last_portal_communication_assigned_at = now(),
           updated_at = now()
     WHERE organization_id = _organization_id
       AND user_id = selected_user_id;
  END IF;

  RETURN selected_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_member_portal_communication_distribution(
  uuid, integer, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_portal_communication_distribution(
  uuid, integer, boolean
) TO authenticated;

REVOKE ALL ON FUNCTION public.select_portal_communication_assignee(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.select_portal_communication_assignee(uuid)
  TO postgres;
