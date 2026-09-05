BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'public.client_portal_process_movement_shares', 'SELECT'
  )
  AND NOT has_table_privilege(
    'authenticated', 'public.client_portal_process_movement_shares', 'INSERT'
  ),
  'process history shares are not a direct browser API'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.client_portal_process_timeline_management(uuid,uuid,uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.set_client_portal_process_movement_shared(uuid,uuid,uuid,uuid,boolean)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated', 'public.client_portal_process_timeline(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.client_portal_process_timeline(uuid)', 'EXECUTE'
  ),
  'process detail RPCs require authentication'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
 ('19500000-0000-0000-0000-000000000001','owner-process-detail@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19500000-0000-0000-0000-000000000002','manager-process-detail@fluxa.test','{}','authenticated','authenticated','',now()),
 ('19500000-0000-0000-0000-000000000003','client-process-detail@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.organizations(id,legal_name,created_by)
VALUES ('29500000-0000-0000-0000-000000000001','Portal Process Detail','19500000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES
 ('29500000-0000-0000-0000-000000000001','19500000-0000-0000-0000-000000000001','proprietario',true),
 ('29500000-0000-0000-0000-000000000001','19500000-0000-0000-0000-000000000002','gestor',true);
INSERT INTO public.clients(id,organization_id,name,email)
VALUES
 ('39500000-0000-0000-0000-000000000001','29500000-0000-0000-0000-000000000001','Cliente Detalhes','client-process-detail@fluxa.test'),
 ('39500000-0000-0000-0000-000000000002','29500000-0000-0000-0000-000000000001','Outro Cliente','other-process-detail@fluxa.test');
INSERT INTO public.processes(id,organization_id,client_id,code,title,stage)
VALUES
 ('49500000-0000-0000-0000-000000000001','29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000001','PROC-DETAIL','Processo acompanhado','em_analise'),
 ('49500000-0000-0000-0000-000000000002','29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000002','PROC-OTHER','Processo de outro cliente','novo');
INSERT INTO public.process_movements(
  id,organization_id,process_id,from_stage,to_stage,description,actor_name
) VALUES
 ('59500000-0000-0000-0000-000000000001','29500000-0000-0000-0000-000000000001','49500000-0000-0000-0000-000000000001','protocolado','em_analise','Protocolo recebido pelo órgão','Nome Interno'),
 ('59500000-0000-0000-0000-000000000002','29500000-0000-0000-0000-000000000001','49500000-0000-0000-0000-000000000001',NULL,NULL,'Nota operacional privada','Nome Interno'),
 ('59500000-0000-0000-0000-000000000003','29500000-0000-0000-0000-000000000001','49500000-0000-0000-0000-000000000002',NULL,'novo','Movimento de outro cliente','Nome Interno');
INSERT INTO public.client_portal_access(
  id,organization_id,client_id,user_id,email,is_active,invited_by
) VALUES (
 '69500000-0000-0000-0000-000000000001','29500000-0000-0000-0000-000000000001',
 '39500000-0000-0000-0000-000000000001','19500000-0000-0000-0000-000000000003',
 'client-process-detail@fluxa.test',true,'19500000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19500000-0000-0000-0000-000000000001',true);
SELECT lives_ok(
  $$SELECT public.set_client_portal_item_shared(
    '29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000001',
    'process','49500000-0000-0000-0000-000000000001',true
  )$$,
  'owner can share the process before selecting public updates'
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_process_timeline_management(
    '29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000001',
    '49500000-0000-0000-0000-000000000001'
  )),
  2,
  'owner sees only movements from the selected client process'
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_process_timeline_management(
    '29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000001',
    '49500000-0000-0000-0000-000000000001'
  ) WHERE is_shared),
  0,
  'process movements start private'
);

SELECT set_config('request.jwt.claim.sub','19500000-0000-0000-0000-000000000002',true);
SELECT throws_ok(
  $$SELECT * FROM public.client_portal_process_timeline_management(
    '29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000001',
    '49500000-0000-0000-0000-000000000001'
  )$$,
  '42501',NULL,'a manager cannot manage client process history'
);

SELECT set_config('request.jwt.claim.sub','19500000-0000-0000-0000-000000000001',true);
SELECT lives_ok(
  $$SELECT public.set_client_portal_process_movement_shared(
    '29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000001',
    '49500000-0000-0000-0000-000000000001','59500000-0000-0000-0000-000000000001',true
  )$$,
  'owner can explicitly share one public process update'
);
SELECT throws_ok(
  $$SELECT public.set_client_portal_process_movement_shared(
    '29500000-0000-0000-0000-000000000001','39500000-0000-0000-0000-000000000001',
    '49500000-0000-0000-0000-000000000001','59500000-0000-0000-0000-000000000003',true
  )$$,
  'P0001','PROCESS_MOVEMENT_NOT_FOUND','another client movement cannot be shared'
);

SELECT set_config('request.jwt.claim.sub','19500000-0000-0000-0000-000000000003',true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_process_timeline(
    '49500000-0000-0000-0000-000000000001'
  )),
  1,
  'portal returns only the explicitly shared update'
);
SELECT is(
  (SELECT description FROM public.client_portal_process_timeline(
    '49500000-0000-0000-0000-000000000001'
  )),
  'Protocolo recebido pelo órgão',
  'portal receives the reviewed public description'
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_process_timeline(
    '49500000-0000-0000-0000-000000000002'
  )),
  0,
  'portal cannot inspect another client process'
);
SELECT is(
  (SELECT count(*)::integer FROM public.process_movements),
  0,
  'portal still has no direct process movement access'
);

RESET ROLE;
UPDATE public.client_portal_access SET is_active = false
 WHERE id = '69500000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','19500000-0000-0000-0000-000000000003',true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_process_timeline(
    '49500000-0000-0000-0000-000000000001'
  )),
  0,
  'disabled portal access cannot read shared process history'
);

RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action = 'client_portal.process_update_shared'
       AND entity_id = '59500000-0000-0000-0000-000000000001'
  ),
  'sharing a process update is audited'
);

SELECT * FROM finish();
ROLLBACK;
