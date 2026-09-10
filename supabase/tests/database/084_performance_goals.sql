BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public', 'organization_performance_goals', 'monthly performance goals table exists');
SELECT ok(
  has_function_privilege('authenticated', 'public.set_organization_performance_goals(uuid,date,integer,integer,integer)', 'EXECUTE'),
  'authenticated reaches the role-guarded goal RPC'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.organization_performance_goals', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.organization_performance_goals', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.organization_performance_goals', 'DELETE'),
  'browser cannot write performance goals directly'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES
  ('1b600000-0000-0000-0000-000000000001','goal-manager@fluxa.test','{}','authenticated','authenticated','',now()),
  ('1b600000-0000-0000-0000-000000000002','goal-viewer@fluxa.test','{}','authenticated','authenticated','',now());

INSERT INTO public.organizations(id,legal_name,created_by)
VALUES ('2b600000-0000-0000-0000-000000000001','Goal Tenant','1b600000-0000-0000-0000-000000000001');

INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES
  ('2b600000-0000-0000-0000-000000000001','1b600000-0000-0000-0000-000000000001','gestor',true),
  ('2b600000-0000-0000-0000-000000000001','1b600000-0000-0000-0000-000000000002','visualizador',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1b600000-0000-0000-0000-000000000001',true);

SELECT lives_ok(
  $$SELECT public.set_organization_performance_goals(
    '2b600000-0000-0000-0000-000000000001','2026-09-18',12,80,15
  )$$,
  'manager saves bounded monthly goals through the RPC'
);

SELECT is(
  (SELECT goal_month::text || '|' || new_clients_target::text || '|' || completed_tasks_target::text || '|' || completed_processes_target::text
     FROM public.organization_performance_goals
    WHERE organization_id='2b600000-0000-0000-0000-000000000001'),
  '2026-09-01|12|80|15',
  'the RPC normalizes the month and persists every target'
);

SELECT throws_ok(
  $$SELECT public.set_organization_performance_goals(
    '2b600000-0000-0000-0000-000000000001','2026-09-01',-1,10,10
  )$$,
  'P0001', 'INVALID_GOAL_TARGET', 'negative goals are rejected'
);

SELECT set_config('request.jwt.claim.sub','1b600000-0000-0000-0000-000000000002',true);
SELECT throws_ok(
  $$SELECT public.set_organization_performance_goals(
    '2b600000-0000-0000-0000-000000000001','2026-09-01',10,10,10
  )$$,
  'P0001', 'NOT_ALLOWED', 'viewer cannot change company goals'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
