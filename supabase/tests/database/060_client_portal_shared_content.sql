BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.client_portal_process_shares', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_process_shares', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_document_shares', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_document_shares', 'INSERT'),
  'share tables are not a browser data API'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.client_portal_share_management(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.client_portal_share_management(uuid,uuid)', 'EXECUTE'),
  'only authenticated identities may call share management'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.client_portal_processes()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.client_portal_documents()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.client_portal_processes()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.client_portal_documents()', 'EXECUTE'),
  'portal content RPCs are authenticated only'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname = 'client_portal_documents_select'
       AND qual ILIKE '%can_access_client_portal_document%'
  ),
  'private storage has a portal-specific read policy'
);

INSERT INTO auth.users(id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
VALUES
  ('19800000-0000-0000-0000-000000000001', 'owner-share@fluxa.test', '{"full_name":"Share Owner"}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000002', 'manager-share@fluxa.test', '{"full_name":"Share Manager"}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000003', 'portal-share@fluxa.test', '{"full_name":"Portal Share"}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000004', 'portal-other-share@fluxa.test', '{"full_name":"Other Portal Share"}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES
  ('29800000-0000-0000-0000-000000000001', 'Shared Content A', '19800000-0000-0000-0000-000000000001'),
  ('29800000-0000-0000-0000-000000000002', 'Shared Content B', '19800000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000002', 'gestor', true),
  ('29800000-0000-0000-0000-000000000002', '19800000-0000-0000-0000-000000000001', 'proprietario', true);
INSERT INTO public.clients(id, organization_id, name, email)
VALUES
  ('39800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', 'Portal Client A', 'portal-share@fluxa.test'),
  ('39800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000001', 'Other Client A', 'other-a@fluxa.test'),
  ('39800000-0000-0000-0000-000000000003', '29800000-0000-0000-0000-000000000002', 'Portal Client B', 'portal-other-share@fluxa.test');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000001', true);
INSERT INTO public.processes(id, organization_id, client_id, code, title, notes, value)
VALUES
  ('49800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', 'PROC-A', 'Visible Process', 'internal process note', 500),
  ('49800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000002', 'PROC-OTHER', 'Other Client Process', 'other internal note', 900),
  ('49800000-0000-0000-0000-000000000003', '29800000-0000-0000-0000-000000000002', '39800000-0000-0000-0000-000000000003', 'PROC-B', 'Other Organization Process', 'other org note', 700);
INSERT INTO public.documents(
  id, organization_id, client_id, process_id, title, file_path,
  original_file_name, stored_file_name, file_extension, mime_type, file_size, notes
) VALUES
  ('59800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000001', 'Visible Document', '29800000-0000-0000-0000-000000000001/processos/49800000-0000-0000-0000-000000000001/visible.pdf', 'visible.pdf', 'visible.pdf', 'pdf', 'application/pdf', 100, 'internal document note'),
  ('59800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000002', '49800000-0000-0000-0000-000000000002', 'Other Client Document', '29800000-0000-0000-0000-000000000001/processos/49800000-0000-0000-0000-000000000002/other.pdf', 'other.pdf', 'other.pdf', 'pdf', 'application/pdf', 200, 'other client note'),
  ('59800000-0000-0000-0000-000000000003', '29800000-0000-0000-0000-000000000002', '39800000-0000-0000-0000-000000000003', '49800000-0000-0000-0000-000000000003', 'Other Organization Document', '29800000-0000-0000-0000-000000000002/processos/49800000-0000-0000-0000-000000000003/other-org.pdf', 'other-org.pdf', 'other-org.pdf', 'pdf', 'application/pdf', 300, 'other org note');

RESET ROLE;
INSERT INTO public.client_portal_access(id, organization_id, client_id, user_id, email, is_active, invited_by)
VALUES
  ('69800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000003', 'portal-share@fluxa.test', true, '19800000-0000-0000-0000-000000000001'),
  ('69800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000002', '39800000-0000-0000-0000-000000000003', '19800000-0000-0000-0000-000000000004', 'portal-other-share@fluxa.test', true, '19800000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_share_management(
    '29800000-0000-0000-0000-000000000001',
    '39800000-0000-0000-0000-000000000001'
  ) WHERE is_shared),
  0,
  'all existing content starts private'
);

SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.set_client_portal_item_shared(
    '29800000-0000-0000-0000-000000000001',
    '39800000-0000-0000-0000-000000000001',
    'process',
    '49800000-0000-0000-0000-000000000001',
    true
  )$$,
  '42501',
  NULL,
  'a manager cannot share portal content'
);

SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.set_client_portal_item_shared('29800000-0000-0000-0000-000000000001','39800000-0000-0000-0000-000000000001','process','49800000-0000-0000-0000-000000000001',true)$$,
  'an owner can share a process'
);
SELECT lives_ok(
  $$SELECT public.set_client_portal_item_shared('29800000-0000-0000-0000-000000000001','39800000-0000-0000-0000-000000000001','document','59800000-0000-0000-0000-000000000001',true)$$,
  'an owner can share a document'
);
SELECT lives_ok(
  $$SELECT public.set_client_portal_item_shared('29800000-0000-0000-0000-000000000002','39800000-0000-0000-0000-000000000003','process','49800000-0000-0000-0000-000000000003',true)$$,
  'an owner can share a process in another organization'
);
SELECT lives_ok(
  $$SELECT public.set_client_portal_item_shared('29800000-0000-0000-0000-000000000002','39800000-0000-0000-0000-000000000003','document','59800000-0000-0000-0000-000000000003',true)$$,
  'an owner can share a document in another organization'
);
SELECT throws_ok(
  $$SELECT public.set_client_portal_item_shared('29800000-0000-0000-0000-000000000001','39800000-0000-0000-0000-000000000001','process','49800000-0000-0000-0000-000000000002',true)$$,
  'P0001',
  'PROCESS_NOT_FOUND',
  'a process belonging to another client cannot be shared'
);

SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.client_portal_processes()), 1, 'portal returns only the shared process for the caller');
SELECT is((SELECT code FROM public.client_portal_processes()), 'PROC-A', 'portal process projection contains the expected process');
SELECT is((SELECT count(*)::integer FROM public.client_portal_documents()), 1, 'portal returns only the shared document for the caller');
SELECT is((SELECT title FROM public.client_portal_documents()), 'Visible Document', 'portal document projection contains the expected document');
SELECT is((SELECT count(*)::integer FROM public.processes), 0, 'portal still has no direct process table access');
SELECT is((SELECT count(*)::integer FROM public.documents), 0, 'portal still has no direct document table access');
SELECT ok(
  public.can_access_client_portal_document('29800000-0000-0000-0000-000000000001/processos/49800000-0000-0000-0000-000000000001/visible.pdf'),
  'portal may open the current file of a shared document'
);
SELECT ok(
  NOT public.can_access_client_portal_document('29800000-0000-0000-0000-000000000001/processos/49800000-0000-0000-0000-000000000002/other.pdf'),
  'portal cannot open another client document'
);
SELECT ok(
  NOT public.can_access_client_portal_document('29800000-0000-0000-0000-000000000002/processos/49800000-0000-0000-0000-000000000003/other-org.pdf'),
  'portal cannot open another organization document'
);
SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000004', true);
SELECT is((SELECT code FROM public.client_portal_processes()), 'PROC-B', 'another portal identity sees only its own organization');
SELECT is((SELECT title FROM public.client_portal_documents()), 'Other Organization Document', 'another portal identity sees only its own shared document');

RESET ROLE;
UPDATE public.client_portal_access SET is_active = false
 WHERE id = '69800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000003', true);
SELECT is((SELECT count(*)::integer FROM public.client_portal_processes()), 0, 'disabled access cannot read shared processes');
SELECT is((SELECT count(*)::integer FROM public.client_portal_documents()), 0, 'disabled access cannot read shared documents');
SELECT ok(
  NOT public.can_access_client_portal_document('29800000-0000-0000-0000-000000000001/processos/49800000-0000-0000-0000-000000000001/visible.pdf'),
  'disabled access cannot open a shared file'
);

RESET ROLE;
UPDATE public.client_portal_access SET is_active = true
 WHERE id = '69800000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19800000-0000-0000-0000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.set_client_portal_item_shared('29800000-0000-0000-0000-000000000001','39800000-0000-0000-0000-000000000001','document','59800000-0000-0000-0000-000000000001',false)$$,
  'an owner can revoke a document without deleting history'
);
RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.client_portal_document_shares
     WHERE document_id = '59800000-0000-0000-0000-000000000001'
       AND NOT is_shared
       AND revoked_at IS NOT NULL
  ),
  'revocation is retained as history instead of deleting the share row'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action = 'client_portal.item_revoked'
       AND entity_id = '59800000-0000-0000-0000-000000000001'
  ),
  'share revocation is audited'
);

SELECT * FROM finish();
ROLLBACK;
