BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SELECT no_plan();

SELECT has_table(
  'public', 'document_code_counters',
  'private document-code counter table exists'
);
SELECT has_column(
  'public', 'documents', 'internal_code',
  'documents expose an internal code'
);
SELECT col_not_null(
  'public', 'documents', 'internal_code',
  'the internal code is mandatory after backfill'
);
SELECT ok(
  (SELECT index_definition.indisunique
   FROM pg_catalog.pg_index AS index_definition
   WHERE index_definition.indexrelid =
     'public.documents_organization_internal_code_key'::regclass),
  'organization and internal code are protected by a unique index'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.documents
    WHERE internal_code IS NULL OR trim(internal_code) = ''
  ),
  'every pre-existing document was backfilled'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.document_code_counters', 'SELECT')
  AND NOT has_table_privilege(
    'authenticated', 'public.document_code_counters', 'SELECT'
  )
  AND NOT has_table_privilege(
    'service_role', 'public.document_code_counters', 'SELECT'
  ),
  'client-facing roles cannot inspect document counters'
);
SELECT ok(
  (SELECT relation.relrowsecurity
   FROM pg_catalog.pg_class AS relation
   WHERE relation.oid = 'public.document_code_counters'::regclass)
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'document_code_counters'
  ),
  'the private counter has RLS enabled and exposes no policy'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.assign_document_internal_code()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.assign_document_internal_code()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.assign_document_internal_code()', 'EXECUTE'
  )
  AND has_function_privilege(
    'postgres', 'public.assign_document_internal_code()', 'EXECUTE'
  ),
  'the assignment trigger function is postgres-only'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('19330000-0000-0000-0000-000000000001', 'document-code-a@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19330000-0000-0000-0000-000000000002', 'document-code-b@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name) VALUES
  ('29330000-0000-0000-0000-000000000001', 'Document Code Tenant A'),
  ('29330000-0000-0000-0000-000000000002', 'Document Code Tenant B');

INSERT INTO public.organization_members(
  organization_id, user_id, role, is_active
) VALUES
  ('29330000-0000-0000-0000-000000000001', '19330000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29330000-0000-0000-0000-000000000002', '19330000-0000-0000-0000-000000000002', 'proprietario', true);

INSERT INTO public.organization_settings(organization_id, timezone) VALUES
  ('29330000-0000-0000-0000-000000000001', 'America/Sao_Paulo'),
  ('29330000-0000-0000-0000-000000000002', 'America/Sao_Paulo');

SELECT set_config(
  'request.jwt.claim.sub',
  '19330000-0000-0000-0000-000000000001',
  true
);

INSERT INTO public.documents(
  id, organization_id, title, internal_code, file_path,
  original_file_name, stored_file_name, file_extension, mime_type, file_size
) VALUES
  ('49330000-0000-0000-0000-000000000001', '29330000-0000-0000-0000-000000000001', 'First coded document', 'FORGED-CODE', 'test/code-a1.pdf', 'code-a1.pdf', 'code-a1.pdf', 'pdf', 'application/pdf', 100),
  ('49330000-0000-0000-0000-000000000002', '29330000-0000-0000-0000-000000000001', 'Second coded document', DEFAULT, 'test/code-a2.pdf', 'code-a2.pdf', 'code-a2.pdf', 'pdf', 'application/pdf', 100);

SELECT like(
  (SELECT internal_code FROM public.documents
   WHERE id = '49330000-0000-0000-0000-000000000001'),
  'DOC-' || extract(year FROM current_date)::integer::text || '-000001',
  'the first tenant code uses the current civil year and starts at one'
);
SELECT like(
  (SELECT internal_code FROM public.documents
   WHERE id = '49330000-0000-0000-0000-000000000002'),
  'DOC-' || extract(year FROM current_date)::integer::text || '-000002',
  'the same tenant receives the next atomic sequence value'
);
SELECT unlike(
  (SELECT internal_code FROM public.documents
   WHERE id = '49330000-0000-0000-0000-000000000001'),
  'FORGED-CODE',
  'a caller-supplied internal code is ignored'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '19330000-0000-0000-0000-000000000002',
  true
);

INSERT INTO public.documents(
  id, organization_id, title, file_path, original_file_name,
  stored_file_name, file_extension, mime_type, file_size
) VALUES (
  '49330000-0000-0000-0000-000000000003',
  '29330000-0000-0000-0000-000000000002',
  'Independent tenant document', 'test/code-b1.pdf', 'code-b1.pdf',
  'code-b1.pdf', 'pdf', 'application/pdf', 100
);

SELECT like(
  (SELECT internal_code FROM public.documents
   WHERE id = '49330000-0000-0000-0000-000000000003'),
  'DOC-' || extract(year FROM current_date)::integer::text || '-000001',
  'a second tenant owns an independent sequence'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '19330000-0000-0000-0000-000000000001',
  true
);

SELECT throws_ok(
  $$
    UPDATE public.documents
    SET internal_code = 'DOC-2099-999999'
    WHERE id = '49330000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'DOCUMENT_INTERNAL_CODE_IMMUTABLE',
  'an existing internal code cannot be changed'
);

UPDATE public.documents
SET title = 'Ordinary edit remains available'
WHERE id = '49330000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT title FROM public.documents
   WHERE id = '49330000-0000-0000-0000-000000000001'),
  'Ordinary edit remains available',
  'ordinary authorized document updates still work'
);
SELECT is(
  (SELECT count(DISTINCT internal_code) FROM public.documents
   WHERE organization_id = '29330000-0000-0000-0000-000000000001'),
  2::bigint,
  'codes remain unique inside a tenant'
);
SELECT is(
  (SELECT last_value FROM public.document_code_counters
   WHERE organization_id = '29330000-0000-0000-0000-000000000001'
     AND code_year = extract(year FROM current_date)::smallint),
  2::bigint,
  'the private counter tracks the assigned sequence'
);

SELECT * FROM finish();
ROLLBACK;
