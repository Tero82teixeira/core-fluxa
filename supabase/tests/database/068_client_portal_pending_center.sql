BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_function_privilege(
    'authenticated', 'public.review_client_portal_document_request(uuid,text,text)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.prepare_client_portal_document_resubmission(uuid,text,text,bigint)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.review_client_portal_document_request(uuid,text,text)', 'EXECUTE'
  ),
  'request review and resubmission require authentication'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
 ('19700000-0000-0000-0000-000000000001','owner-pending-center@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19700000-0000-0000-0000-000000000002','client-pending-center@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19700000-0000-0000-0000-000000000003','outsider-pending-center@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,created_by)
VALUES ('29700000-0000-0000-0000-000000000001','Portal Pending Center','19700000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES ('29700000-0000-0000-0000-000000000001','19700000-0000-0000-0000-000000000001','proprietario',true);
INSERT INTO public.clients(id,organization_id,name,email)
VALUES ('39700000-0000-0000-0000-000000000001','29700000-0000-0000-0000-000000000001','Cliente Pendências','client-pending-center@fluxa.test');
INSERT INTO public.client_portal_access(
  id,organization_id,client_id,user_id,email,is_active,invited_by
) VALUES (
 '69700000-0000-0000-0000-000000000001','29700000-0000-0000-0000-000000000001',
 '39700000-0000-0000-0000-000000000001','19700000-0000-0000-0000-000000000002',
 'client-pending-center@fluxa.test',true,'19700000-0000-0000-0000-000000000001'
);
INSERT INTO public.client_portal_document_requests(
  id,organization_id,client_id,title,description,due_date,status,created_by
) VALUES (
 '59700000-0000-0000-0000-000000000001','29700000-0000-0000-0000-000000000001',
 '39700000-0000-0000-0000-000000000001','Comprovante atualizado',
 'Envie o comprovante completo.',current_date + 5,'pending',
 '19700000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19700000-0000-0000-0000-000000000001',true);
INSERT INTO public.documents(
  id,organization_id,client_id,title,file_path,original_file_name,stored_file_name,
  file_extension,mime_type,file_size,current_version
) VALUES (
 '49700000-0000-0000-0000-000000000001','29700000-0000-0000-0000-000000000001',
 '39700000-0000-0000-0000-000000000001','Comprovante atualizado',
 '29700000-0000-0000-0000-000000000001/clientes/39700000-0000-0000-0000-000000000001/comprovante.pdf',
 'comprovante.pdf','comprovante.pdf','pdf','application/pdf',1024,1
);

RESET ROLE;
UPDATE public.client_portal_document_requests
   SET status = 'submitted',
       submitted_document_id = '49700000-0000-0000-0000-000000000001',
       submitted_at = now()
 WHERE id = '59700000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19700000-0000-0000-0000-000000000001',true);
SELECT lives_ok(
  $$SELECT public.review_client_portal_document_request(
    '59700000-0000-0000-0000-000000000001','revision_requested',
    'A imagem está cortada. Envie o documento completo.'
  )$$,
  'owner can request a correction with safe client feedback'
);

SELECT set_config('request.jwt.claim.sub','19700000-0000-0000-0000-000000000002',true);
SELECT is(
  (SELECT status FROM public.client_portal_document_requests()),
  'revision_requested',
  'client sees that a correction was requested'
);
SELECT is(
  (SELECT company_feedback FROM public.client_portal_document_requests()),
  'A imagem está cortada. Envie o documento completo.',
  'client sees the company correction instructions'
);
SELECT is(
  (SELECT submission_count FROM public.client_portal_document_requests()),
  1,
  'the first submitted file is counted'
);
SELECT throws_ok(
  $$SELECT count(*) FROM public.client_portal_document_requests$$,
  '42501',
  'permission denied for table client_portal_document_requests',
  'portal still has no direct table access'
);
SELECT is(
  (SELECT count(*)::integer FROM public.prepare_client_portal_document_resubmission(
    '59700000-0000-0000-0000-000000000001','comprovante-corrigido.pdf','application/pdf',2048
  )),
  1,
  'client can prepare one narrowly scoped corrected upload'
);
SELECT is(
  (SELECT status FROM public.client_portal_document_requests()),
  'pending',
  'request returns to upload state only after authorized resubmission preparation'
);

SELECT set_config('request.jwt.claim.sub','19700000-0000-0000-0000-000000000003',true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_document_requests()),
  0,
  'unrelated authenticated user cannot inspect the request'
);
SELECT throws_ok(
  $$SELECT public.prepare_client_portal_document_resubmission(
    '59700000-0000-0000-0000-000000000001','roubo.pdf','application/pdf',1024
  )$$,
  '42501',
  'REVISION_REQUEST_NOT_FOUND',
  'unrelated user cannot prepare a resubmission'
);

SELECT * FROM finish();
ROLLBACK;
