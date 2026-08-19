-- Restore the private document Storage contract when an environment has drifted.
-- Only the bucket's privacy flag is reconciled; all other existing bucket
-- configuration remains untouched.
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-documents', 'organization-documents', false)
ON CONFLICT (id) DO UPDATE
SET public = false
WHERE storage.buckets.public IS DISTINCT FROM false;

-- Permit the client to roll back an upload whose following document write
-- failed, without allowing referenced files or another user's files to be
-- removed. The four canonical document policies are intentionally unchanged.
DROP POLICY IF EXISTS "org_documents_delete_own_orphan" ON storage.objects;

CREATE POLICY "org_documents_delete_own_orphan"
ON storage.objects
FOR DELETE
TO authenticated
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
