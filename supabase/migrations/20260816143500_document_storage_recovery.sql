-- Keep document uploads private and allow uploaders to clean up only their own unreferenced objects.
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-documents', 'organization-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "org_documents_delete_own_orphan" ON storage.objects;
CREATE POLICY "org_documents_delete_own_orphan" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'organization-documents'
    AND owner_id = (SELECT auth.uid())::text
    AND public.storage_path_org(name) IS NOT NULL
    AND public.has_org_role(
      public.storage_path_org(name),
      ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[]
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.organization_id = public.storage_path_org(name)
        AND d.file_path = name
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.document_versions dv
      WHERE dv.organization_id = public.storage_path_org(name)
        AND dv.file_path = name
    )
  );
