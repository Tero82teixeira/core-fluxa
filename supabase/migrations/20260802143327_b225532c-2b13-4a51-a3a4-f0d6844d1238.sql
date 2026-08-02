-- 1) Internal trigger function must not be callable from the API
REVOKE ALL ON FUNCTION public.tasks_enforce_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.documents_enforce_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.documents_sync_monitoring() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organizations_seed_document_types() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_default_document_types(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Make fail-closed deletes explicit: soft-delete/archival is the product model
REVOKE DELETE ON public.clients FROM anon, authenticated;
REVOKE DELETE ON public.processes FROM anon, authenticated;
REVOKE DELETE ON public.documents FROM anon, authenticated;

-- 3) Invitations are written only through SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM anon, authenticated;
GRANT ALL ON public.organization_invitations TO service_role;