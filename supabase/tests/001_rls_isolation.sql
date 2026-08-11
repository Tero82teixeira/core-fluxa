begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Administrative fixture setup. These deterministic local users are Auth rows;
-- every assertion below changes to the same roles/JWT claims PostgREST uses.
set local role postgres;
insert into public.organizations(id,legal_name,trade_name,slug) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Empresa Alpha','Empresa Alpha','integration-alpha'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Empresa Beta','Empresa Beta','integration-beta');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner.alpha@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000002','authenticated','authenticated','admin.alpha@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000003','authenticated','authenticated','manager.alpha@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000004','authenticated','authenticated','operator.alpha@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000005','authenticated','authenticated','viewer.alpha@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','10000000-0000-4000-8000-000000000006','authenticated','authenticated','inactive.alpha@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','20000000-0000-4000-8000-000000000001','authenticated','authenticated','owner.beta@example.test','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','30000000-0000-4000-8000-000000000001','authenticated','authenticated','nomember@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members(organization_id,user_id,role,is_active) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000001','proprietario',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000002','administrador',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000003','gestor',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000004','operacional',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000005','visualizador',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000006','operacional',false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','20000000-0000-4000-8000-000000000001','proprietario',true)
on conflict(organization_id,user_id) do update set role=excluded.role,is_active=excluded.is_active;
insert into public.organization_settings(organization_id,portal_name) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Alpha'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Beta');
insert into public.clients(id,organization_id,name,email) values
 ('a1000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Cliente Alpha','pii-alpha@example.test'),
 ('b1000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Cliente Beta','pii-beta@example.test');
insert into public.processes(id,organization_id,code,client_id,title) values
 ('a2000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ALPHA-1','a1000000-0000-4000-8000-000000000001','Processo Alpha'),
 ('b2000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','BETA-1','b1000000-0000-4000-8000-000000000001','Processo Beta');
insert into public.tasks(id,organization_id,title,client_id,process_id,due_at) values
 ('a3000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Tarefa Alpha','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',now()-interval '1 day'),
 ('b3000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Tarefa Beta','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',now()-interval '1 day');
insert into public.notifications(organization_id,title) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Alpha'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Beta');
insert into public.audit_logs(organization_id,action,entity) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture','test'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fixture','test');

select ok(c.relrowsecurity, format('%s has RLS enabled', c.relname))
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname=any(array['clients','processes','tasks','financial_transactions','financial_transaction_payments','financial_recurrences','communication_threads','communication_entries','monitoring_states','organization_settings','organization_members','organization_invitations','notifications','audit_logs','support_requests']);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from clients where name='Cliente Alpha'),1,'owner reads own client');
select is((select count(*)::int from clients where name='Cliente Beta'),0,'Alpha cannot SELECT Cliente Beta');
select is((select count(*)::int from processes where title='Processo Beta'),0,'cross-org process hidden');
select is((select count(*)::int from tasks where title='Tarefa Beta'),0,'cross-org task hidden');
select is((select count(*)::int from organization_settings where portal_name='Beta'),0,'cross-org settings hidden');
select is((select count(*)::int from notifications where title='Beta'),0,'cross-org notifications hidden');
select is((select count(*)::int from audit_logs where organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),0,'cross-org audit hidden');
select throws_ok($$insert into tasks(organization_id,title,client_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bad link','b1000000-0000-4000-8000-000000000001')$$, 'P0001', 'TASK_CLIENT_ORG_MISMATCH', 'cross-org task/client link rejected');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
select is((select count(*)::int from clients where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),0,'inactive member is blocked');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from clients),0,'authenticated user without membership is blocked');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select * from public.clients limit 1$$,'42501','permission denied for table clients','anon cannot read clients');

-- Characterization, not a false green: this assertion intentionally records the
-- known insecure final policy and must change only in the dedicated remediation PR.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select lives_ok($$insert into audit_logs(organization_id,actor_id,action,entity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'KNOWN_SECURITY_FINDING_AUDIT_LOGS_DIRECT_INSERT','test')$$,'KNOWN_SECURITY_FINDING_AUDIT_LOGS_DIRECT_INSERT: ordinary member can insert');
select diag('KNOWN SECURITY FINDING: direct audit_logs insert is currently allowed');

select * from finish();
rollback;
