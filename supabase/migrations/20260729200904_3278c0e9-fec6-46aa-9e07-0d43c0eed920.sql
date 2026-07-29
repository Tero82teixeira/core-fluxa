REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role[]) FROM PUBLIC, anon;
DROP POLICY "orgs_insert_any" ON public.organizations;
CREATE POLICY "orgs_insert_authenticated" ON public.organizations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);