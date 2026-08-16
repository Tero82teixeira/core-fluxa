BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(7);

SELECT ok(EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'organization-documents'
), 'organization-documents bucket exists');

SELECT ok(NOT (SELECT public FROM storage.buckets WHERE id = 'organization-documents'),
  'organization-documents bucket is private');

SELECT policies_are('storage', 'objects', ARRAY[
  'org_documents_delete',
  'org_documents_delete_own_orphan',
  'org_documents_insert',
  'org_documents_select',
  'org_documents_update'
], 'document storage policies remain installed');

SELECT ok(position('owner_id' in qual) > 0 AND position('auth.uid' in qual) > 0,
  'orphan cleanup is restricted to the authenticated owner')
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'org_documents_delete_own_orphan';

SELECT ok(position('has_org_role' in qual) > 0 AND position('storage_path_org' in qual) > 0,
  'orphan cleanup preserves organization and role isolation')
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'org_documents_delete_own_orphan';

SELECT ok(position('documents' in qual) > 0 AND position('file_path' in qual) > 0,
  'orphan cleanup denies paths referenced by documents')
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'org_documents_delete_own_orphan';

SELECT ok(position('document_versions' in qual) > 0 AND position('file_path' in qual) > 0,
  'orphan cleanup denies paths referenced by document versions')
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'org_documents_delete_own_orphan';

SELECT * FROM finish();
ROLLBACK;
