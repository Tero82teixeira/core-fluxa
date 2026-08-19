-- Security audit stage 15: invitations, onboarding, and organization creation.
-- Keep required reads behind RLS and all membership/invitation writes behind RPCs.

REVOKE TRUNCATE, TRIGGER, REFERENCES
ON TABLE
  public.organizations,
  public.organization_members,
  public.organization_invitations,
  public.profiles
FROM authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
ON TABLE public.organization_invitations
FROM anon;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.organization_members
FROM authenticated, anon;

DROP POLICY IF EXISTS members_insert ON public.organization_members;
DROP POLICY IF EXISTS members_update_admin ON public.organization_members;
DROP POLICY IF EXISTS members_delete_admin ON public.organization_members;

-- Reassert the reviewed client RPC surface without replacing function bodies.
REVOKE ALL ON FUNCTION
  public.bootstrap_organization(),
  public.accept_invitation(text),
  public.create_invitation(uuid,text,public.app_role),
  public.cancel_invitation(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.bootstrap_organization(),
  public.accept_invitation(text),
  public.create_invitation(uuid,text,public.app_role),
  public.cancel_invitation(uuid)
TO authenticated;

REVOKE ALL ON FUNCTION public.invitation_preview(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text)
TO anon, authenticated;

-- This diagnostic was removed previously. Keep it closed if schema drift brings
-- it back without making this additive migration depend on the function.
DO $$
BEGIN
  IF to_regprocedure('public.pending_invitation_diagnostics()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.pending_invitation_diagnostics() FROM PUBLIC, anon, authenticated';
  END IF;
END
$$;
