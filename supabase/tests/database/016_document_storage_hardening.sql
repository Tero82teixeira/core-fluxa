BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

SELECT ok(EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'organization-documents'),
  'organization-documents bucket exists');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'organization-documents'), false,
  'organization-documents bucket is private');
SELECT ok((SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage' AND c.relname = 'objects'), 'storage.objects has RLS enabled');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'org_documents_delete_own_orphan'), 'orphan cleanup policy exists');
SELECT is((SELECT cmd FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'org_documents_delete_own_orphan'), 'DELETE', 'orphan cleanup applies to DELETE');
SELECT ok((SELECT 'authenticated' = ANY(roles) FROM pg_policies WHERE schemaname = 'storage'
  AND tablename = 'objects' AND policyname = 'org_documents_delete_own_orphan'),
  'orphan cleanup includes authenticated');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('org_documents_select', 'org_documents_insert', 'org_documents_update', 'org_documents_delete')),
  4::bigint, 'all four canonical document policies remain');

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at) VALUES
  ('16000000-0000-0000-0000-000000000001', 'storage-owner-16@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('16000000-0000-0000-0000-000000000002', 'storage-other-16@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());
INSERT INTO public.organizations (id, legal_name, trade_name) VALUES
  ('26000000-0000-0000-0000-000000000001', 'Storage Stage 16 A', 'Storage 16 A'),
  ('26000000-0000-0000-0000-000000000002', 'Storage Stage 16 B', 'Storage 16 B');
INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES
  ('26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'visualizador', true),
  ('26000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000002', 'visualizador', true);

INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('organization-documents', '26000000-0000-0000-0000-000000000001/orphan.pdf', '16000000-0000-0000-0000-000000000001'),
  ('organization-documents', '26000000-0000-0000-0000-000000000001/other-owner.pdf', '16000000-0000-0000-0000-000000000002'),
  ('organization-documents', '26000000-0000-0000-0000-000000000001/document.pdf', '16000000-0000-0000-0000-000000000001'),
  ('organization-documents', '26000000-0000-0000-0000-000000000001/version.pdf', '16000000-0000-0000-0000-000000000001');
INSERT INTO public.documents (id, organization_id, title, file_path, original_file_name,
  stored_file_name, file_extension, mime_type, file_size) VALUES
  ('46000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001',
   'Referenced document', '26000000-0000-0000-0000-000000000001/document.pdf', 'document.pdf', 'document.pdf', 'pdf', 'application/pdf', 1),
  ('46000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000001',
   'Version parent', '26000000-0000-0000-0000-000000000001/parent.pdf', 'parent.pdf', 'parent.pdf', 'pdf', 'application/pdf', 1);
INSERT INTO public.document_versions (organization_id, document_id, version_number, file_path,
  original_file_name, stored_file_name, mime_type, file_size) VALUES
  ('26000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000002', 1,
   '26000000-0000-0000-0000-000000000001/version.pdf', 'version.pdf', 'version.pdf', 'application/pdf', 1);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
DELETE FROM storage.objects WHERE bucket_id = 'organization-documents'
  AND name = '26000000-0000-0000-0000-000000000001/orphan.pdf';
SELECT is((SELECT count(*) FROM storage.objects WHERE name = '26000000-0000-0000-0000-000000000001/orphan.pdf'),
  1::bigint, 'user from another organization cannot delete an object');

SELECT set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
DELETE FROM storage.objects WHERE bucket_id = 'organization-documents'
  AND name = '26000000-0000-0000-0000-000000000001/other-owner.pdf';
SELECT is((SELECT count(*) FROM storage.objects WHERE name = '26000000-0000-0000-0000-000000000001/other-owner.pdf'),
  1::bigint, 'member cannot delete another owner object');
DELETE FROM storage.objects WHERE bucket_id = 'organization-documents'
  AND name = '26000000-0000-0000-0000-000000000001/orphan.pdf';
SELECT is((SELECT count(*) FROM storage.objects WHERE name = '26000000-0000-0000-0000-000000000001/orphan.pdf'),
  0::bigint, 'owner can delete own orphan object');
DELETE FROM storage.objects WHERE bucket_id = 'organization-documents'
  AND name = '26000000-0000-0000-0000-000000000001/document.pdf';
SELECT is((SELECT count(*) FROM storage.objects WHERE name = '26000000-0000-0000-0000-000000000001/document.pdf'),
  1::bigint, 'owner cannot delete object referenced by documents');
DELETE FROM storage.objects WHERE bucket_id = 'organization-documents'
  AND name = '26000000-0000-0000-0000-000000000001/version.pdf';
SELECT is((SELECT count(*) FROM storage.objects WHERE name = '26000000-0000-0000-0000-000000000001/version.pdf'),
  1::bigint, 'owner cannot delete object referenced by document_versions');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
