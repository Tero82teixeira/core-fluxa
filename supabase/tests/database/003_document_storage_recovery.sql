BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(3);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'organization-documents'
      AND name = 'organization-documents'
      AND public = false
  ),
  'private organization-documents bucket exists'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'org_documents_delete_own_orphan'
      AND cmd = 'DELETE'
      AND 'authenticated' = ANY(roles)
  ),
  'authenticated users have the guarded orphan cleanup policy'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'org_documents_delete_own_orphan'
      AND qual ILIKE '%owner_id%'
      AND qual ILIKE '%auth.uid%'
      AND qual ILIKE '%documents%'
      AND qual ILIKE '%document_versions%'
  ),
  'cleanup requires ownership and refuses paths referenced by documents or versions'
);

SELECT * FROM finish();
ROLLBACK;
