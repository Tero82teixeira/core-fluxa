BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.client_portal_document_requests', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_document_requests', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_upload_intents', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_upload_intents', 'INSERT'),
  'request and upload-intent tables are not browser data APIs'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.client_portal_document_requests()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.prepare_client_portal_document_upload(uuid,text,text,bigint)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.finalize_client_portal_document_upload(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.client_portal_document_requests()', 'EXECUTE'),
  'portal request operations require an authenticated identity'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'client_portal_documents_insert'
       AND with_check ILIKE '%can_upload_client_portal_document%'
  ),
  'storage insert is guarded by the short-lived portal intent'
);

INSERT INTO auth.users(id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
VALUES
  ('19900000-0000-0000-0000-000000000001', 'owner-request@fluxa.test', '{"full_name":"Request Owner"}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000002', 'manager-request@fluxa.test', '{"full_name":"Request Manager"}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000003', 'portal-request@fluxa.test', '{"full_name":"Request Portal"}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000004', 'outsider-request@fluxa.test', '{"full_name":"Request Outsider"}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES ('29900000-0000-0000-0000-000000000001', 'Document Requests', '19900000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000002', 'gestor', true);
INSERT INTO public.clients(id, organization_id, name, email)
VALUES ('39900000-0000-0000-0000-000000000001', '29900000-0000-0000-0000-000000000001', 'Request Client', 'portal-request@fluxa.test');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19900000-0000-0000-0000-000000000001', true);
INSERT INTO public.processes(id, organization_id, client_id, code, title)
VALUES ('49900000-0000-0000-0000-000000000001', '29900000-0000-0000-0000-000000000001', '39900000-0000-0000-0000-000000000001', 'REQ-001', 'Request Process');
SELECT lives_ok(
  $$SELECT public.create_client_portal_document_request(
    '29900000-0000-0000-0000-000000000001',
    '39900000-0000-0000-0000-000000000001',
    '49900000-0000-0000-0000-000000000001',
    'Comprovante de endereço', 'Documento atualizado', current_date + 7
  )$$,
  'an owner can create a portal document request'
);

SELECT set_config('request.jwt.claim.sub', '19900000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.create_client_portal_document_request(
    '29900000-0000-0000-0000-000000000001',
    '39900000-0000-0000-0000-000000000001', NULL,
    'Not allowed', NULL, NULL
  )$$,
  '42501', NULL, 'a manager cannot create a portal request'
);

RESET ROLE;
UPDATE public.client_portal_document_requests
   SET id = '59900000-0000-0000-0000-000000000001'
 WHERE organization_id = '29900000-0000-0000-0000-000000000001';
INSERT INTO public.client_portal_access(
  id, organization_id, client_id, user_id, email, is_active, invited_by
) VALUES (
  '69900000-0000-0000-0000-000000000001',
  '29900000-0000-0000-0000-000000000001',
  '39900000-0000-0000-0000-000000000001',
  '19900000-0000-0000-0000-000000000003',
  'portal-request@fluxa.test', true,
  '19900000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19900000-0000-0000-0000-000000000003', true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_document_requests()),
  1,
  'the linked portal identity sees its pending request'
);
SELECT is(
  (SELECT process_code FROM public.client_portal_document_requests() LIMIT 1),
  'REQ-001',
  'portal projection exposes the related process code'
);
SELECT lives_ok(
  $$SELECT * FROM public.prepare_client_portal_document_upload(
    (SELECT request_id FROM public.client_portal_document_requests() LIMIT 1),
    'endereco.pdf', 'application/pdf', 1024
  )$$,
  'the linked client can prepare a valid upload'
);
SELECT throws_ok(
  $$SELECT * FROM public.prepare_client_portal_document_upload(
    (SELECT request_id FROM public.client_portal_document_requests() LIMIT 1),
    'script.exe', 'application/octet-stream', 1024
  )$$,
  'P0001', 'INVALID_FILE_EXTENSION',
  'an unsupported file is rejected before storage'
);

SELECT set_config('request.jwt.claim.sub', '19900000-0000-0000-0000-000000000004', true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_document_requests()),
  0,
  'an unrelated authenticated identity sees no requests'
);
SELECT throws_ok(
  $$SELECT * FROM public.prepare_client_portal_document_upload(
    '59900000-0000-0000-0000-000000000001',
    'stolen.pdf', 'application/pdf', 1024
  )$$,
  '42501', NULL, 'an unrelated identity cannot prepare an upload'
);

SELECT * FROM finish();
ROLLBACK;
