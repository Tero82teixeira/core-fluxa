BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(53);

-- 27 grant assertions: anon has no DML/DDL powers; authenticated has no DDL powers.
SELECT ok(NOT has_table_privilege('anon', format('public.%I', table_name), privilege),
  format('anon has no %s on %s', privilege, table_name))
FROM unnest(ARRAY['documents','document_versions','document_types']) table_name
CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) privilege;
SELECT ok(NOT has_table_privilege('authenticated', format('public.%I', table_name), privilege),
  format('authenticated has no %s on %s', privilege, table_name))
FROM unnest(ARRAY['documents','document_versions','document_types']) table_name
CROSS JOIN unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) privilege;

SELECT ok(to_regprocedure('public.documents_authorization_guard()') IS NOT NULL, 'documents authorization guard remains installed');
SELECT ok(to_regprocedure('public.document_versions_authorization_guard()') IS NOT NULL, 'version authorization guard remains installed');
SELECT ok(to_regprocedure('public.documents_enforce_links()') IS NOT NULL, 'document link guard remains installed');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('documents','document_versions')
  AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%atendimento%'
), 'final document policies contain no atendimento role');

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('13000000-0000-0000-0000-000000000001','owner-doc13@fluxa.test','{"full_name":"Owner 13"}','authenticated','authenticated','',now()),
 ('13000000-0000-0000-0000-000000000002','admin-doc13@fluxa.test','{"full_name":"Admin 13"}','authenticated','authenticated','',now()),
 ('13000000-0000-0000-0000-000000000003','manager-doc13@fluxa.test','{"full_name":"Manager 13"}','authenticated','authenticated','',now()),
 ('13000000-0000-0000-0000-000000000004','operator-doc13@fluxa.test','{"full_name":"Operator 13"}','authenticated','authenticated','',now()),
 ('13000000-0000-0000-0000-000000000005','viewer-doc13@fluxa.test','{"full_name":"Viewer 13"}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('23000000-0000-0000-0000-000000000001','Document Stage 13 A','Doc 13 A'),
 ('23000000-0000-0000-0000-000000000002','Document Stage 13 B','Doc 13 B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','proprietario',true),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000002','administrador',true),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000003','gestor',true),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000004','operacional',true),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000005','visualizador',true),
 ('23000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000001','proprietario',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000005',true);
SELECT ok((SELECT count(*) > 0 FROM public.document_types WHERE organization_id='23000000-0000-0000-0000-000000000001'), 'common member can select document types');

SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
SELECT throws_ok($$INSERT INTO public.document_types(organization_id,name,category) VALUES('23000000-0000-0000-0000-000000000001','Operator denied','outros')$$, 'operator cannot insert document type');
SELECT is((WITH changed AS (UPDATE public.document_types SET description='operator denied' WHERE organization_id='23000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) FROM changed), 0::bigint, 'operator cannot update document type');

SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
SELECT throws_ok($$INSERT INTO public.document_types(organization_id,name,category) VALUES('23000000-0000-0000-0000-000000000001','Manager denied','outros')$$, 'manager cannot insert document type');
SELECT is((WITH changed AS (UPDATE public.document_types SET description='manager denied' WHERE organization_id='23000000-0000-0000-0000-000000000001' RETURNING 1) SELECT count(*) FROM changed), 0::bigint, 'manager cannot update document type');

SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($$INSERT INTO public.document_types(id,organization_id,name,category) VALUES('33000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','Owner type 13','outros')$$, 'owner can insert document type');
SELECT lives_ok($$UPDATE public.document_types SET description='owner update' WHERE id='33000000-0000-0000-0000-000000000001'$$, 'owner can update document type');
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
SELECT lives_ok($$INSERT INTO public.document_types(id,organization_id,name,category) VALUES('33000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000001','Admin type 13','outros')$$, 'administrator can insert document type');
SELECT lives_ok($$UPDATE public.document_types SET description='admin update' WHERE id='33000000-0000-0000-0000-000000000002'$$, 'administrator can update document type');

SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
SELECT lives_ok($$INSERT INTO public.documents(id,organization_id,title,file_path,original_file_name,stored_file_name,file_extension,mime_type,file_size,uploaded_by) VALUES('43000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','Operator upload','a/op.pdf','op.pdf','op.pdf','pdf','application/pdf',10,'13000000-0000-0000-0000-000000000001')$$, 'operator can upload document');
SELECT is((SELECT uploaded_by FROM public.documents WHERE id='43000000-0000-0000-0000-000000000001'),'13000000-0000-0000-0000-000000000004'::uuid,'uploaded_by spoofing is normalized');
SELECT throws_ok($$UPDATE public.documents SET status='aprovado' WHERE id='43000000-0000-0000-0000-000000000001'$$,'P0001','DOCUMENT_SENSITIVE_UPDATE_DENIED','operator cannot approve');
SELECT throws_ok($$UPDATE public.documents SET status='rejeitado' WHERE id='43000000-0000-0000-0000-000000000001'$$,'P0001','DOCUMENT_SENSITIVE_UPDATE_DENIED','operator cannot reject');
SELECT throws_ok($$UPDATE public.documents SET archived_at=now() WHERE id='43000000-0000-0000-0000-000000000001'$$,'P0001','DOCUMENT_SENSITIVE_UPDATE_DENIED','operator cannot archive');

SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
SELECT lives_ok($$INSERT INTO public.documents(id,organization_id,title,file_path,original_file_name,stored_file_name,file_extension,mime_type,file_size) VALUES('43000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000001','Manager upload','a/mgr.pdf','mgr.pdf','mgr.pdf','pdf','application/pdf',10)$$, 'manager can upload document');
SELECT lives_ok($$INSERT INTO public.document_versions(organization_id,document_id,version_number,file_path,original_file_name,stored_file_name,mime_type,file_size) VALUES('23000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000002',1,'a/mgr.pdf','mgr.pdf','mgr.pdf','application/pdf',10)$$, 'manager can insert document version');
SELECT throws_ok($$UPDATE public.documents SET status='aprovado' WHERE id='43000000-0000-0000-0000-000000000002'$$,'P0001','DOCUMENT_SENSITIVE_UPDATE_DENIED','manager cannot approve');
SELECT throws_ok($$UPDATE public.documents SET status='rejeitado' WHERE id='43000000-0000-0000-0000-000000000002'$$,'P0001','DOCUMENT_SENSITIVE_UPDATE_DENIED','manager cannot reject');

SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
SELECT lives_ok($$UPDATE public.documents SET status='aprovado' WHERE id='43000000-0000-0000-0000-000000000002'$$, 'administrator can review');
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
SELECT throws_ok($$UPDATE public.documents SET organization_id='23000000-0000-0000-0000-000000000002' WHERE id='43000000-0000-0000-0000-000000000001'$$,'P0001','DOCUMENT_ORGANIZATION_IMMUTABLE','document organization cannot change');
SELECT lives_ok($$INSERT INTO public.documents(id,organization_id,title,file_path,original_file_name,stored_file_name,file_extension,mime_type,file_size) VALUES('43000000-0000-0000-0000-000000000003','23000000-0000-0000-0000-000000000002','Other org','b/other.pdf','other.pdf','other.pdf','pdf','application/pdf',10)$$, 'owner creates cross-organization test document');
SELECT throws_ok($$INSERT INTO public.document_versions(organization_id,document_id,version_number,file_path,original_file_name,stored_file_name,mime_type,file_size) VALUES('23000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000003',1,'x','x','x','application/pdf',1)$$,'P0001','DOCUMENT_VERSION_ORG_MISMATCH','version cannot reference another organization document');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
