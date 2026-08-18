-- Role changes from authenticated sessions must use change_member_role(), whose
-- SECURITY DEFINER context remains able to perform the underlying UPDATE.
CREATE OR REPLACE FUNCTION public.guard_organization_member_role_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'MEMBER_ROLE_UPDATE_REQUIRES_RPC';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_organization_member_role_update_trg
  ON public.organization_members;
CREATE TRIGGER guard_organization_member_role_update_trg
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.guard_organization_member_role_update();

REVOKE ALL ON FUNCTION public.guard_organization_member_role_update()
  FROM PUBLIC, anon, authenticated;
