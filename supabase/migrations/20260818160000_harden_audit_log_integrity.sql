-- Audit events are append-only and client identity is always derived server-side.
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_logs FROM anon;

CREATE OR REPLACE FUNCTION public.record_audit_event(
  _organization_id uuid,
  _action text,
  _entity text,
  _entity_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_audit_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'AUDIT_AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = _organization_id
      AND member.user_id = v_actor_id
      AND member.is_active
  ) THEN
    RAISE EXCEPTION 'AUDIT_ORGANIZATION_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_id,
    actor_name,
    action,
    entity,
    entity_id,
    metadata
  )
  VALUES (
    _organization_id,
    v_actor_id,
    (SELECT profile.full_name FROM public.profiles AS profile WHERE profile.id = v_actor_id),
    _action,
    _entity,
    _entity_id,
    COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit_event(uuid, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_audit_event(uuid, text, text, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.record_audit_event(uuid, text, text, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_audit_event(uuid, text, text, uuid, jsonb) TO authenticated;
