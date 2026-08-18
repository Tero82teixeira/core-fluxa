BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(31);

SELECT ok(NOT has_function_privilege('anon', 'public.communication_entry_validate_scope()', 'EXECUTE'), 'anon cannot execute communication_entry_validate_scope');
SELECT ok(NOT has_function_privilege('anon', 'public.communication_validate_links()', 'EXECUTE'), 'anon cannot execute communication_validate_links');
SELECT ok(NOT has_function_privilege('anon', 'public.financial_guard_immutable_org()', 'EXECUTE'), 'anon cannot execute financial_guard_immutable_org');
SELECT ok(NOT has_function_privilege('anon', 'public.financial_validate_links()', 'EXECUTE'), 'anon cannot execute financial_validate_links');
SELECT ok(NOT has_function_privilege('authenticated', 'public.communication_entry_validate_scope()', 'EXECUTE'), 'authenticated cannot execute communication_entry_validate_scope');
SELECT ok(NOT has_function_privilege('authenticated', 'public.communication_validate_links()', 'EXECUTE'), 'authenticated cannot execute communication_validate_links');
SELECT ok(NOT has_function_privilege('authenticated', 'public.financial_guard_immutable_org()', 'EXECUTE'), 'authenticated cannot execute financial_guard_immutable_org');
SELECT ok(NOT has_function_privilege('authenticated', 'public.financial_validate_links()', 'EXECUTE'), 'authenticated cannot execute financial_validate_links');
SELECT ok(has_function_privilege('service_role', 'public.communication_entry_validate_scope()', 'EXECUTE'), 'service_role can execute communication_entry_validate_scope');
SELECT ok(has_function_privilege('service_role', 'public.communication_validate_links()', 'EXECUTE'), 'service_role can execute communication_validate_links');
SELECT ok(has_function_privilege('service_role', 'public.financial_guard_immutable_org()', 'EXECUTE'), 'service_role can execute financial_guard_immutable_org');
SELECT ok(has_function_privilege('service_role', 'public.financial_validate_links()', 'EXECUTE'), 'service_role can execute financial_validate_links');
SELECT ok(has_function_privilege('postgres', 'public.communication_entry_validate_scope()', 'EXECUTE'), 'postgres can execute communication_entry_validate_scope');
SELECT ok(has_function_privilege('postgres', 'public.communication_validate_links()', 'EXECUTE'), 'postgres can execute communication_validate_links');
SELECT ok(has_function_privilege('postgres', 'public.financial_guard_immutable_org()', 'EXECUTE'), 'postgres can execute financial_guard_immutable_org');
SELECT ok(has_function_privilege('postgres', 'public.financial_validate_links()', 'EXECUTE'), 'postgres can execute financial_validate_links');

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
 ('18000000-0000-0000-0000-000000000001','trigger-helper-a@fluxa.test','{}','authenticated','authenticated','',now()),
 ('18000000-0000-0000-0000-000000000002','trigger-helper-b@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name) VALUES
 ('28000000-0000-0000-0000-000000000001','Trigger Helper A'),
 ('28000000-0000-0000-0000-000000000002','Trigger Helper B');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
 ('28000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001','administrador',true),
 ('28000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000002','administrador',true);
INSERT INTO public.clients(id,organization_id,name) VALUES
 ('38000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','Client A'),
 ('38000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','Client B');
INSERT INTO public.processes(id,organization_id,code,client_id,title,stage) VALUES
 ('48000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','HELP-A','38000000-0000-0000-0000-000000000001','Process A','novo'),
 ('48000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','HELP-B','38000000-0000-0000-0000-000000000002','Process B','novo');
INSERT INTO public.tasks(id,organization_id,title,client_id,process_id,created_by) VALUES
 ('58000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','Task B','38000000-0000-0000-0000-000000000002','48000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000002');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18000000-0000-0000-0000-000000000002',true);
INSERT INTO public.documents(id,organization_id,title,file_path,original_file_name,stored_file_name,file_extension,mime_type,file_size,uploaded_by) VALUES
 ('68000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','Document B','b/doc.pdf','doc.pdf','doc.pdf','pdf','application/pdf',1,'18000000-0000-0000-0000-000000000002');
RESET ROLE;
INSERT INTO public.financial_categories(id,organization_id,name,type,created_by) VALUES
 ('78000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','Category B','expense','18000000-0000-0000-0000-000000000002');
INSERT INTO public.financial_accounts(id,organization_id,name,type,created_by) VALUES
 ('88000000-0000-0000-0000-000000000002','28000000-0000-0000-0000-000000000002','Account B','bank','18000000-0000-0000-0000-000000000002');

SELECT lives_ok($$INSERT INTO public.communication_threads(id,organization_id,client_id,subject,process_id,created_by) VALUES('98000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000001','Valid thread','48000000-0000-0000-0000-000000000001','18000000-0000-0000-0000-000000000001')$$, 'communication link trigger still permits a valid insert');
SELECT lives_ok($$INSERT INTO public.communication_entries(organization_id,thread_id,entry_type,content,created_by) VALUES('28000000-0000-0000-0000-000000000001','98000000-0000-0000-0000-000000000001','nota_interna','Valid entry','18000000-0000-0000-0000-000000000001')$$, 'communication scope trigger still permits a valid insert');
SELECT lives_ok($$UPDATE public.communication_threads SET subject='Valid updated thread' WHERE id='98000000-0000-0000-0000-000000000001'$$, 'communication link trigger still permits a valid update');
SELECT throws_ok($$INSERT INTO public.communication_threads(organization_id,client_id,subject,created_by) VALUES('28000000-0000-0000-0000-000000000001','38000000-0000-0000-0000-000000000002','Wrong client','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'COMMUNICATION_CLIENT_ORG_MISMATCH', 'communication rejects a client from another organization');
SELECT throws_ok($$UPDATE public.communication_threads SET process_id='48000000-0000-0000-0000-000000000002' WHERE id='98000000-0000-0000-0000-000000000001'$$, 'P0001', 'COMMUNICATION_PROCESS_ORG_MISMATCH', 'communication rejects a process from another organization');
SELECT throws_ok($$INSERT INTO public.communication_entries(organization_id,thread_id,entry_type,content,created_by) VALUES('28000000-0000-0000-0000-000000000002','98000000-0000-0000-0000-000000000001','mensagem','Wrong scope','18000000-0000-0000-0000-000000000002')$$, 'P0001', 'COMMUNICATION_ENTRY_ORG_MISMATCH', 'communication rejects an entry organization mismatch');
SELECT throws_ok($$UPDATE public.communication_threads SET organization_id='28000000-0000-0000-0000-000000000002' WHERE id='98000000-0000-0000-0000-000000000001'$$, 'P0001', 'COMMUNICATION_ORGANIZATION_IMMUTABLE', 'communication organization remains immutable');

SELECT throws_ok($$INSERT INTO public.financial_transactions(organization_id,type,description,amount,due_date,category_id,created_by) VALUES('28000000-0000-0000-0000-000000000001','expense','Bad category',10,current_date,'78000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'INVALID_CATEGORY_ORGANIZATION', 'financial category organization is validated');
SELECT throws_ok($$INSERT INTO public.financial_transactions(organization_id,type,description,amount,due_date,account_id,created_by) VALUES('28000000-0000-0000-0000-000000000001','expense','Bad account',10,current_date,'88000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'INVALID_ACCOUNT_ORGANIZATION', 'financial account organization is validated');
SELECT throws_ok($$INSERT INTO public.financial_transactions(organization_id,type,description,amount,due_date,client_id,created_by) VALUES('28000000-0000-0000-0000-000000000001','expense','Bad client',10,current_date,'38000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'INVALID_CLIENT_ORGANIZATION', 'financial client organization is validated');
SELECT throws_ok($$INSERT INTO public.financial_transactions(organization_id,type,description,amount,due_date,process_id,created_by) VALUES('28000000-0000-0000-0000-000000000001','expense','Bad process',10,current_date,'48000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'INVALID_PROCESS_ORGANIZATION', 'financial process organization is validated');
SELECT throws_ok($$INSERT INTO public.financial_transactions(organization_id,type,description,amount,due_date,task_id,created_by) VALUES('28000000-0000-0000-0000-000000000001','expense','Bad task',10,current_date,'58000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'INVALID_TASK_ORGANIZATION', 'financial task organization is validated');
SELECT throws_ok($$INSERT INTO public.financial_transactions(organization_id,type,description,amount,due_date,document_id,created_by) VALUES('28000000-0000-0000-0000-000000000001','expense','Bad document',10,current_date,'68000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'INVALID_DOCUMENT_ORGANIZATION', 'financial document organization is validated');
SELECT throws_ok($$INSERT INTO public.financial_transactions(organization_id,type,description,amount,due_date,responsible_user_id,created_by) VALUES('28000000-0000-0000-0000-000000000001','expense','Bad responsible',10,current_date,'18000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001')$$, 'P0001', 'INVALID_RESPONSIBLE_ORGANIZATION', 'financial responsible user organization is validated');

INSERT INTO public.financial_transactions(id,organization_id,type,description,amount,due_date,created_by) VALUES('a8000000-0000-0000-0000-000000000001','28000000-0000-0000-0000-000000000001','expense','Valid transaction',10,current_date,'18000000-0000-0000-0000-000000000001');
SELECT throws_ok($$UPDATE public.financial_transactions SET organization_id='28000000-0000-0000-0000-000000000002' WHERE id='a8000000-0000-0000-0000-000000000001'$$, 'P0001', 'ORGANIZATION_IMMUTABLE', 'financial organization remains immutable');

SELECT * FROM finish();
ROLLBACK;
