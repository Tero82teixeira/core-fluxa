BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(22);

SELECT is((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='monitoring_states' AND c.relkind='r'), 1::bigint, 'monitoring_states exists exactly once');
SELECT is((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='monitoring_state_history' AND c.relkind='r'), 1::bigint, 'monitoring_state_history exists exactly once');
SELECT is((SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='monitoring_states'), ARRAY['id','organization_id','source_type','source_id','alert_kind','monitoring_status','assigned_to','priority_override','notes','resolved_at','ignored_at','created_by','created_at','updated_at']::text[], 'monitoring_states exposes every final column in UI order');
SELECT is((SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='monitoring_state_history'), ARRAY['id','organization_id','monitoring_state_id','action','details','note','actor_id','created_at']::text[], 'monitoring_state_history exposes every final column');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.monitoring_states'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (organization_id, source_type, source_id, alert_kind)'), 'monitoring state source has the expected unique constraint');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.monitoring_states'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%monitoring_status%novo%em_analise%acompanhado%resolvido%ignorado%'), 'monitoring status values remain constrained');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.monitoring_states'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%priority_override%baixa%media%alta%critica%'), 'monitoring priority values remain constrained');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.monitoring_state_history'::regclass AND contype='f' AND confrelid='public.monitoring_states'::regclass AND confdeltype='r'), 'history keeps its restrictive monitoring state foreign key');
SELECT is((SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='monitoring_states' AND indexname='monitoring_states_org_status_idx'), 1::bigint, 'organization/status monitoring index exists exactly once');
SELECT like((SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='monitoring_states_org_status_idx'), '%(organization_id, monitoring_status, updated_at DESC)%', 'organization/status monitoring index keeps the expected columns');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.monitoring_states'::regclass), 'monitoring_states has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.monitoring_state_history'::regclass), 'monitoring_state_history has RLS enabled');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='monitoring_states' AND policyname='monitoring_states_read_member' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND qual='is_org_member(organization_id)'), 1::bigint, 'monitoring state read policy remains organization-scoped');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='monitoring_state_history' AND policyname='monitoring_state_history_read_member' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND qual='is_org_member(organization_id)'), 1::bigint, 'monitoring history read policy remains organization-scoped');
SELECT is((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('upsert_monitoring_state','change_monitoring_status','assign_monitoring_item','add_monitoring_note')), 4::bigint, 'all four monitoring RPCs remain present');
SELECT is((SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='operational_monitoring_alerts'), ARRAY['organization_id','source_type','source_id','alert_kind','title','description','client_id','client_name','process_id','process_code','responsible_id','responsible_name','source_priority','suggested_priority','relevant_at','last_movement_at','days_delta','reason','source_status','monitoring_status','assigned_to','assigned_name','priority_override','notes','state_updated_at']::text[], 'monitoring view schema matches the UI contract');

INSERT INTO auth.users (id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES ('10000000-0000-0000-0000-000000000020','monitoring@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations (id,legal_name) VALUES ('20000000-0000-0000-0000-000000000020','Monitoring Authorized Org'),('20000000-0000-0000-0000-000000000021','Monitoring Other Org');
INSERT INTO public.organization_members (organization_id,user_id,role) VALUES ('20000000-0000-0000-0000-000000000020','10000000-0000-0000-0000-000000000020','administrador');
INSERT INTO public.tasks (id,organization_id,title,status) VALUES ('40000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000020','Source task','pendente');
INSERT INTO public.monitoring_states (organization_id,source_type,source_id,alert_kind) VALUES
 ('20000000-0000-0000-0000-000000000020','tarefa','40000000-0000-0000-0000-000000000020','test_authorized'),
 ('20000000-0000-0000-0000-000000000021','tarefa','40000000-0000-0000-0000-000000000021','test_other');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000020',true);
SELECT is((SELECT count(*) FROM public.monitoring_states WHERE organization_id='20000000-0000-0000-0000-000000000020'), 1::bigint, 'authorized user reads monitoring state from their organization');
SELECT is((SELECT count(*) FROM public.monitoring_states WHERE organization_id='20000000-0000-0000-0000-000000000021'), 0::bigint, 'user cannot read monitoring state from another organization');
SELECT lives_ok($$SELECT public.change_monitoring_status('20000000-0000-0000-0000-000000000020','tarefa','40000000-0000-0000-0000-000000000020','test_authorized','resolvido')$$, 'authorized user resolves a monitoring alert');
SELECT lives_ok($$SELECT public.change_monitoring_status('20000000-0000-0000-0000-000000000020','tarefa','40000000-0000-0000-0000-000000000020','test_authorized','novo')$$, 'authorized user reopens a monitoring alert');
RESET ROLE;
SELECT is((SELECT status::text FROM public.tasks WHERE id='40000000-0000-0000-0000-000000000020'), 'pendente', 'resolve and reopen do not change the source entity');
SELECT is((SELECT array_agg(action ORDER BY created_at) FROM public.monitoring_state_history h JOIN public.monitoring_states s ON s.id=h.monitoring_state_id WHERE s.source_id='40000000-0000-0000-0000-000000000020'), ARRAY['resolvido','reaberto']::text[], 'resolve and reopen are recorded only in monitoring history');

SELECT * FROM finish();
ROLLBACK;
