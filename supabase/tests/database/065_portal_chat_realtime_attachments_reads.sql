BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.communication_attachments', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.communication_thread_reads', 'SELECT'),
  'attachment and read receipt tables are not direct browser APIs'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.prepare_communication_attachment_upload(uuid,text,text,bigint)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.finalize_communication_attachment_upload(uuid,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.mark_client_portal_communication_read(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.mark_staff_portal_communication_read(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.prepare_communication_attachment_upload(uuid,text,text,bigint)', 'EXECUTE'),
  'chat attachment and read operations require authentication'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'communication_attachments_insert')
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname = 'communication_attachments_select'),
  'private attachment storage has scoped insert and read policies'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages'
          AND policyname = 'portal_chat_broadcast_select')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'communication_entries_portal_broadcast')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'communication_reads_portal_broadcast'),
  'messages and read receipts emit authorized realtime signals'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
 ('19400000-0000-0000-0000-000000000001','owner-chat-plus@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19400000-0000-0000-0000-000000000002','staff-chat-plus@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19400000-0000-0000-0000-000000000003','client-chat-plus@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19400000-0000-0000-0000-000000000004','viewer-chat-plus@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,created_by)
VALUES ('29400000-0000-0000-0000-000000000001','Portal Chat Plus','19400000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES
 ('29400000-0000-0000-0000-000000000001','19400000-0000-0000-0000-000000000001','proprietario',true),
 ('29400000-0000-0000-0000-000000000001','19400000-0000-0000-0000-000000000002','operacional',true),
 ('29400000-0000-0000-0000-000000000001','19400000-0000-0000-0000-000000000004','visualizador',true);
INSERT INTO public.clients(id,organization_id,name,email)
VALUES ('39400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001','Cliente Chat Plus','client-chat-plus@fluxa.test');
INSERT INTO public.client_portal_access(id,organization_id,client_id,user_id,email,is_active,invited_by)
VALUES (
 '69400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001',
 '39400000-0000-0000-0000-000000000001','19400000-0000-0000-0000-000000000003',
 'client-chat-plus@fluxa.test',true,'19400000-0000-0000-0000-000000000001'
);
INSERT INTO public.communication_threads(id,organization_id,client_id,subject,channel,status,priority,created_by)
VALUES (
 '49400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001',
 '39400000-0000-0000-0000-000000000001','Chat completo','interno','aguardando_equipe','normal',
 '19400000-0000-0000-0000-000000000001'
);
INSERT INTO public.client_portal_communication_shares(organization_id,client_id,thread_id,is_shared,opened_by_client,shared_at)
VALUES (
 '29400000-0000-0000-0000-000000000001','39400000-0000-0000-0000-000000000001',
 '49400000-0000-0000-0000-000000000001',true,true,now()
);
INSERT INTO public.communication_entries(id,organization_id,thread_id,entry_type,content,created_by,is_internal,metadata,occurred_at)
VALUES
 ('59400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001',
  '49400000-0000-0000-0000-000000000001','mensagem','Mensagem do cliente',
  '19400000-0000-0000-0000-000000000003',false,'{"source":"client_portal"}',now()-interval '2 minutes'),
 ('59400000-0000-0000-0000-000000000002','29400000-0000-0000-0000-000000000001',
  '49400000-0000-0000-0000-000000000001','mensagem','Resposta da empresa',
  '19400000-0000-0000-0000-000000000002',false,'{"source":"staff_quick_chat"}',now()-interval '1 minute');
INSERT INTO public.communication_attachments(
 id,organization_id,client_id,thread_id,entry_id,uploader_id,uploader_kind,file_path,
 original_file_name,mime_type,file_size,completed_at
) VALUES (
 '79400000-0000-0000-0000-000000000001','29400000-0000-0000-0000-000000000001',
 '39400000-0000-0000-0000-000000000001','49400000-0000-0000-0000-000000000001',
 '59400000-0000-0000-0000-000000000001','19400000-0000-0000-0000-000000000003','client',
 '29400000-0000-0000-0000-000000000001/49400000-0000-0000-0000-000000000001/file.pdf',
 'comprovante.pdf','application/pdf',1024,now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19400000-0000-0000-0000-000000000003',true);
SELECT lives_ok(
 $$SELECT * FROM public.prepare_communication_attachment_upload(
   '49400000-0000-0000-0000-000000000001','foto.png','image/png',2048
 )$$,
 'the linked client can prepare a valid private attachment'
);
SELECT throws_ok(
 $$SELECT * FROM public.prepare_communication_attachment_upload(
   '49400000-0000-0000-0000-000000000001','programa.exe','application/octet-stream',2048
 )$$,
 'P0001','INVALID_FILE_EXTENSION','unsupported attachment formats are rejected'
);
SELECT lives_ok(
 $$SELECT public.mark_client_portal_communication_read('49400000-0000-0000-0000-000000000001')$$,
 'the client can mark the shared conversation as read'
);
SELECT ok(
 (SELECT read_at IS NOT NULL FROM public.client_portal_communication_entries(
   '49400000-0000-0000-0000-000000000001'
 ) WHERE entry_id = '59400000-0000-0000-0000-000000000002'),
 'the company message exposes its client read receipt'
);
SELECT is(
 (SELECT attachment_name FROM public.client_portal_communication_entries(
   '49400000-0000-0000-0000-000000000001'
 ) WHERE entry_id = '59400000-0000-0000-0000-000000000001'),
 'comprovante.pdf','authorized attachment metadata reaches the client projection'
);

SELECT set_config('request.jwt.claim.sub','19400000-0000-0000-0000-000000000002',true);
SELECT lives_ok(
 $$SELECT public.mark_staff_portal_communication_read(
   '29400000-0000-0000-0000-000000000001','49400000-0000-0000-0000-000000000001'
 )$$,
 'operational staff can mark a portal conversation as read'
);
SELECT ok(
 (SELECT read_at IS NOT NULL FROM public.staff_client_portal_communication_entries(
   '29400000-0000-0000-0000-000000000001','49400000-0000-0000-0000-000000000001'
 ) WHERE entry_id = '59400000-0000-0000-0000-000000000001'),
 'the client message exposes its company read receipt'
);

SELECT set_config('request.jwt.claim.sub','19400000-0000-0000-0000-000000000004',true);
SELECT throws_ok(
 $$SELECT * FROM public.staff_client_portal_communication_entries(
   '29400000-0000-0000-0000-000000000001','49400000-0000-0000-0000-000000000001'
 )$$,
 'P0001','COMMUNICATION_WRITE_PERMISSION_DENIED','a viewer cannot read the staff chat projection'
);
SELECT throws_ok(
 $$SELECT * FROM public.prepare_communication_attachment_upload(
   '49400000-0000-0000-0000-000000000001','foto.png','image/png',2048
 )$$,
 '42501',NULL,'a viewer cannot create an attachment intent'
);

SELECT * FROM finish();
ROLLBACK;
