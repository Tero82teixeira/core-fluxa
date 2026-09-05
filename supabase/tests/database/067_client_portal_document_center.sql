BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_function_privilege('authenticated', 'public.client_portal_documents()', 'EXECUTE')
  AND has_function_privilege(
    'authenticated', 'public.client_portal_document_versions(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.client_portal_document_versions(uuid)', 'EXECUTE'
  ),
  'document center projections require authentication'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
 ('19600000-0000-0000-0000-000000000001','owner-document-center@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19600000-0000-0000-0000-000000000002','client-document-center@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,created_by)
VALUES ('29600000-0000-0000-0000-000000000001','Portal Document Center','19600000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES ('29600000-0000-0000-0000-000000000001','19600000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.clients(id,organization_id,name,email)
VALUES
 ('39600000-0000-0000-0000-000000000001','29600000-0000-0000-0000-000000000001','Cliente Documentos','client-document-center@fluxa.test'),
 ('39600000-0000-0000-0000-000000000002','29600000-0000-0000-0000-000000000001','Outro Cliente','other-document-center@fluxa.test');
INSERT INTO public.client_portal_access(
  id,organization_id,client_id,user_id,email,is_active,invited_by
) VALUES (
 '69600000-0000-0000-0000-000000000001','29600000-0000-0000-0000-000000000001',
 '39600000-0000-0000-0000-000000000001','19600000-0000-0000-0000-000000000002',
 'client-document-center@fluxa.test',true,'19600000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19600000-0000-0000-0000-000000000001',true);
INSERT INTO public.processes(id,organization_id,client_id,code,title)
VALUES ('49600000-0000-0000-0000-000000000001','29600000-0000-0000-0000-000000000001','39600000-0000-0000-0000-000000000001','PROC-DOC','Processo dos documentos');
INSERT INTO public.document_types(id,organization_id,name,category,created_by)
VALUES ('79600000-0000-0000-0000-000000000001','29600000-0000-0000-0000-000000000001','Contrato social','contrato','19600000-0000-0000-0000-000000000001');
INSERT INTO public.documents(
  id,organization_id,client_id,process_id,document_type_id,title,file_path,
  original_file_name,stored_file_name,file_extension,mime_type,file_size,current_version,notes
) VALUES
 ('59600000-0000-0000-0000-000000000001','29600000-0000-0000-0000-000000000001','39600000-0000-0000-0000-000000000001','49600000-0000-0000-0000-000000000001','79600000-0000-0000-0000-000000000001','Contrato atualizado','29600000-0000-0000-0000-000000000001/processos/49600000-0000-0000-0000-000000000001/v2.pdf','contrato-v2.pdf','v2.pdf','pdf','application/pdf',2048,2,'nota interna'),
 ('59600000-0000-0000-0000-000000000002','29600000-0000-0000-0000-000000000001','39600000-0000-0000-0000-000000000002',NULL,NULL,'Documento de outro cliente','29600000-0000-0000-0000-000000000001/clientes/39600000-0000-0000-0000-000000000002/outro.pdf','outro.pdf','outro.pdf','pdf','application/pdf',1024,1,'outra nota');
INSERT INTO public.document_versions(
  id,organization_id,document_id,version_number,file_path,original_file_name,
  stored_file_name,mime_type,file_size,notes
) VALUES
 ('89600000-0000-0000-0000-000000000001','29600000-0000-0000-0000-000000000001','59600000-0000-0000-0000-000000000001',1,'29600000-0000-0000-0000-000000000001/processos/49600000-0000-0000-0000-000000000001/v1.pdf','contrato-v1.pdf','v1.pdf','application/pdf',1024,'nota privada da versão'),
 ('89600000-0000-0000-0000-000000000002','29600000-0000-0000-0000-000000000001','59600000-0000-0000-0000-000000000001',2,'29600000-0000-0000-0000-000000000001/processos/49600000-0000-0000-0000-000000000001/v2.pdf','contrato-v2.pdf','v2.pdf','application/pdf',2048,'outra nota privada');
SELECT lives_ok(
  $$SELECT public.set_client_portal_item_shared(
    '29600000-0000-0000-0000-000000000001','39600000-0000-0000-0000-000000000001',
    'document','59600000-0000-0000-0000-000000000001',true
  )$$,
  'owner can share the current document'
);

SELECT set_config('request.jwt.claim.sub','19600000-0000-0000-0000-000000000002',true);
SELECT is((SELECT count(*)::integer FROM public.client_portal_documents()),1,
  'portal receives only its shared document');
SELECT is((SELECT current_version FROM public.client_portal_documents()),2,
  'document projection exposes the current version number');
SELECT is((SELECT document_type_name FROM public.client_portal_documents()),'Contrato social',
  'document projection exposes the safe document type');
SELECT is((SELECT category FROM public.client_portal_documents()),'contrato',
  'document projection exposes the safe category');
SELECT is((SELECT count(*)::integer FROM public.client_portal_document_versions(
  '59600000-0000-0000-0000-000000000001'
)),2,'portal receives safe metadata for every version of its shared document');
SELECT is((SELECT count(*)::integer FROM public.client_portal_document_versions(
  '59600000-0000-0000-0000-000000000002'
)),0,'portal cannot inspect another client document history');
SELECT is((SELECT count(*)::integer FROM public.document_versions),0,
  'portal has no direct access to version rows or their internal notes');

RESET ROLE;
UPDATE public.client_portal_access SET is_active = false
 WHERE id = '69600000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19600000-0000-0000-0000-000000000002',true);
SELECT is((SELECT count(*)::integer FROM public.client_portal_document_versions(
  '59600000-0000-0000-0000-000000000001'
)),0,'disabled portal access cannot read document version history');

SELECT * FROM finish();
ROLLBACK;
