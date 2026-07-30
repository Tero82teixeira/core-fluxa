REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS orgs_no_delete ON public.organizations;
CREATE POLICY orgs_no_delete ON public.organizations FOR DELETE TO authenticated USING (false);