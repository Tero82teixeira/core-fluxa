REVOKE ALL ON FUNCTION public.documents_enforce_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.documents_sync_monitoring() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organizations_seed_document_types() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_default_document_types(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_document_types(uuid) TO authenticated;