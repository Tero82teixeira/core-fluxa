BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('12000000-0000-0000-0000-000000000001','owner-hardening@fluxa.test','{"full_name":"Owner"}','authenticated','authenticated','',now()),
 ('12000000-0000-0000-0000-000000000002','manager-hardening@fluxa.test','{"full_name":"Manager"}','authenticated','authenticated','',now()),
 ('12000000-0000-0000-0000-000000000003','operator-hardening@fluxa.test','{"full_name":"Operator"}','authenticated','authenticated','',now()),
 ('12000000-0000-0000-0000-000000000004','viewer-hardening@fluxa.test','{"full_name":"Viewer"}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,trade_name) VALUES
 ('22000000-0000-0000-0000-000000000001','Hardening A Ltda','Hardening A'),
 ('22000000-0000-0000-0000-000000000002','Hardening B Ltda','Hardening B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','proprietario',true),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002','gestor',true),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000003','operacional',true),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','visualizador',true),
 ('22000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.financial_transactions(id,organization_id,type,description,amount,due_date,created_by)
VALUES ('32000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','income','Segredo financeiro',100,current_date,'12000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
INSERT INTO public.documents(id,organization_id,title,status,file_path,original_file_name,stored_file_name,file_extension,mime_type,file_size,reviewed_by,reviewed_by_name,reviewed_at,rejection_reason)
VALUES ('42000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','Documento A','rejeitado','a/v1.pdf','v1.pdf','v1.pdf','pdf','application/pdf',10,'12000000-0000-0000-0000-000000000002','Identidade forjada','2000-01-01','corrigir');
INSERT INTO public.documents(id,organization_id,title,file_path,original_file_name,stored_file_name,file_extension,mime_type,file_size)
VALUES ('42000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000002','Documento B','b/v1.pdf','v1.pdf','v1.pdf','pdf','application/pdf',10);
INSERT INTO public.documents(id,organization_id,title,file_path,original_file_name,stored_file_name,file_extension,mime_type,file_size,reviewed_by,reviewed_by_name,reviewed_at,rejection_reason)
VALUES ('42000000-0000-0000-0000-000000000003','22000000-0000-0000-0000-000000000001','Upload normal','a/normal.pdf','normal.pdf','normal.pdf','pdf','application/pdf',10,'12000000-0000-0000-0000-000000000002','Identidade forjada','2000-01-01','motivo indevido');

SELECT ok((SELECT reviewed_by='12000000-0000-0000-0000-000000000001' AND reviewed_by_name='Owner' AND reviewed_at IS NOT NULL FROM public.documents WHERE id='42000000-0000-0000-0000-000000000001'),'insert revisado normaliza identidade e data do revisor');
SELECT ok((SELECT reviewed_by IS NULL AND reviewed_by_name IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL FROM public.documents WHERE id='42000000-0000-0000-0000-000000000003'),'upload normal remove metadados de revisao enviados no payload');

SELECT is((SELECT count(*) FROM public.financial_transactions),1::bigint,'proprietario le transacao financeira');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
SELECT is((SELECT count(*) FROM public.financial_transactions),1::bigint,'gestor le transacao financeira');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
SELECT is((SELECT count(*) FROM public.financial_transactions),0::bigint,'operacional nao le transacao financeira');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000004',true);
SELECT is((SELECT count(*) FROM public.financial_transactions),0::bigint,'visualizador nao le transacao financeira');

SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
SELECT is((SELECT count(*) FROM public.documents WHERE id='42000000-0000-0000-0000-000000000001'),1::bigint,'operacional enxerga documento');
SELECT throws_ok($$UPDATE public.documents SET status='aprovado' WHERE id='42000000-0000-0000-0000-000000000001'$$,'P0001','DOCUMENT_SENSITIVE_UPDATE_DENIED','operacional nao aprova');
SELECT throws_ok($$UPDATE public.documents SET archived_at=now() WHERE id='42000000-0000-0000-0000-000000000001'$$,'P0001','DOCUMENT_SENSITIVE_UPDATE_DENIED','operacional nao arquiva');
SELECT throws_ok($$UPDATE public.documents SET reviewed_by='12000000-0000-0000-0000-000000000003' WHERE id='42000000-0000-0000-0000-000000000001'$$,'P0001','DOCUMENT_REVIEW_PROVENANCE_IMMUTABLE','operacional nao forja revisor');
SELECT lives_ok($$UPDATE public.documents SET current_version=2,file_path='a/v2.pdf',original_file_name='v2.pdf',stored_file_name='v2.pdf',file_size=20,status='em_analise',uploaded_by='12000000-0000-0000-0000-000000000003',uploaded_by_name='Operator',rejection_reason=NULL WHERE id='42000000-0000-0000-0000-000000000001'$$,'operacional envia nova versao legitima');
SELECT is((SELECT status::text FROM public.documents WHERE id='42000000-0000-0000-0000-000000000001'),'em_analise','nova versao volta para analise');
SELECT ok((SELECT reviewed_by IS NULL AND reviewed_by_name IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL FROM public.documents WHERE id='42000000-0000-0000-0000-000000000001'),'nova versao limpa revisao anterior');

SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000004',true);
SELECT throws_ok($$INSERT INTO public.document_versions(organization_id,document_id,version_number,file_path,original_file_name,stored_file_name,mime_type,file_size) VALUES('22000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001',2,'x','x','x','application/pdf',1)$$,'P0001','DOCUMENT_VERSION_UPLOAD_DENIED','visualizador nao insere versao');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
SELECT throws_ok($$INSERT INTO public.document_versions(organization_id,document_id,version_number,file_path,original_file_name,stored_file_name,mime_type,file_size) VALUES('22000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000002',2,'x','x','x','application/pdf',1)$$,'P0001','DOCUMENT_VERSION_ORG_MISMATCH','versao rejeita documento de outra organizacao');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
