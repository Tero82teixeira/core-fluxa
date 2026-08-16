-- Keep the private document bucket reproducible in fresh environments without
-- changing settings of an existing bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-documents', 'organization-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Upload rollback needs to remove an object when the following database write
-- fails. Editors may delete only an object they personally uploaded and only
-- while that object is still orphaned (not referenced by documents/history).
DROP POLICY IF EXISTS "org_documents_delete_own_orphan" ON storage.objects;
CREATE POLICY "org_documents_delete_own_orphan" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'organization-documents'
    AND public.storage_path_org(name) IS NOT NULL
    AND public.is_org_member(public.storage_path_org(name))
    AND owner_id = (SELECT auth.uid()::text)
    AND NOT EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.organization_id = public.storage_path_org(storage.objects.name)
        AND d.file_path = storage.objects.name
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.document_versions v
      WHERE v.organization_id = public.storage_path_org(storage.objects.name)
        AND v.file_path = storage.objects.name
    )
  );
