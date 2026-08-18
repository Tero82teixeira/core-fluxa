-- Process history is append-only; user identity is always derived server-side.
DROP POLICY IF EXISTS "movements_insert" ON public.process_movements;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.process_movements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.process_movements FROM anon;

CREATE OR REPLACE FUNCTION public.record_process_movement(
  _organization_id uuid,
  _process_id uuid,
  _description text,
  _from_stage public.process_stage DEFAULT NULL,
  _to_stage public.process_stage DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_movement_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'PROCESS_MOVEMENT_AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(_description), '') IS NULL THEN
    RAISE EXCEPTION 'PROCESS_MOVEMENT_DESCRIPTION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = _organization_id
      AND member.user_id = v_actor_id
      AND member.is_active
  ) THEN
    RAISE EXCEPTION 'PROCESS_MOVEMENT_ORGANIZATION_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.processes AS process
    WHERE process.id = _process_id
      AND process.organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'PROCESS_MOVEMENT_PROCESS_ORGANIZATION_MISMATCH' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.process_movements (
    organization_id,
    process_id,
    from_stage,
    to_stage,
    description,
    actor_name,
    created_by
  )
  VALUES (
    _organization_id,
    _process_id,
    _from_stage,
    _to_stage,
    btrim(_description),
    (SELECT profile.full_name FROM public.profiles AS profile WHERE profile.id = v_actor_id),
    v_actor_id
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_process_movement(uuid, uuid, text, public.process_stage, public.process_stage) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_process_movement(uuid, uuid, text, public.process_stage, public.process_stage) FROM anon;
REVOKE ALL ON FUNCTION public.record_process_movement(uuid, uuid, text, public.process_stage, public.process_stage) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_process_movement(uuid, uuid, text, public.process_stage, public.process_stage) TO authenticated;
