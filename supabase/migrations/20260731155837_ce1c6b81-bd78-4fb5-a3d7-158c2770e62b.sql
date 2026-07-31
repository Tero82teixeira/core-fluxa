REVOKE DELETE ON public.profiles FROM authenticated;
REVOKE INSERT, DELETE ON public.organizations FROM authenticated;
REVOKE DELETE ON public.organization_settings FROM authenticated;
REVOKE ALL ON public.profiles, public.organizations, public.organization_members, public.organization_settings FROM anon;