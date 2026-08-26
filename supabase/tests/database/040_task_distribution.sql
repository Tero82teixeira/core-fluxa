BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_column('public', 'organization_members', 'distribution_sector');
SELECT has_column('public', 'organization_members', 'distribution_function');
SELECT has_column('public', 'organization_members', 'automatic_task_capacity');
SELECT has_column('public', 'organization_members', 'receives_automatic_tasks');
SELECT has_column('public', 'organization_members', 'last_automatic_task_at');
SELECT has_function(
  'public', 'update_member_task_distribution',
  ARRAY['uuid', 'text', 'text', 'integer', 'boolean']
);
SELECT has_function(
  'public', 'select_task_distribution_assignee',
  ARRAY['uuid', 'text', 'text']
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_member_task_distribution(uuid,text,text,integer,boolean)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.select_task_distribution_assignee(uuid,text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.select_task_distribution_assignee(uuid,text,text)',
    'EXECUTE'
  ),
  'only the guarded profile RPC is exposed to authenticated users'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password,
  email_confirmed_at
) VALUES
  ('41300000-0000-0000-0000-000000000001', 'distribution-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('41300000-0000-0000-0000-000000000002', 'distribution-one@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('41300000-0000-0000-0000-000000000003', 'distribution-two@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('41300000-0000-0000-0000-000000000004', 'distribution-viewer@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('41300000-0000-0000-0000-000000000005', 'distribution-other@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name) VALUES
  ('51300000-0000-0000-0000-000000000001', 'Distribution Tenant'),
  ('51300000-0000-0000-0000-000000000002', 'Other Distribution Tenant');

INSERT INTO public.organization_members(
  id, organization_id, user_id, role, is_active,
  distribution_sector, distribution_function, automatic_task_capacity,
  receives_automatic_tasks
) VALUES
  ('61300000-0000-0000-0000-000000000001', '51300000-0000-0000-0000-000000000001', '41300000-0000-0000-0000-000000000001', 'proprietario', true, NULL, NULL, 20, false),
  ('61300000-0000-0000-0000-000000000002', '51300000-0000-0000-0000-000000000001', '41300000-0000-0000-0000-000000000002', 'operacional', true, 'Jurídico', 'Analista', 4, true),
  ('61300000-0000-0000-0000-000000000003', '51300000-0000-0000-0000-000000000001', '41300000-0000-0000-0000-000000000003', 'operacional', true, 'jurídico', 'analista', 10, true),
  ('61300000-0000-0000-0000-000000000004', '51300000-0000-0000-0000-000000000001', '41300000-0000-0000-0000-000000000004', 'visualizador', true, 'Jurídico', 'Analista', 100, true),
  ('61300000-0000-0000-0000-000000000005', '51300000-0000-0000-0000-000000000002', '41300000-0000-0000-0000-000000000005', 'operacional', true, 'Jurídico', 'Analista', 100, true);

INSERT INTO public.tasks(
  id, organization_id, title, status, priority, assignee_id, created_by
) VALUES
  ('71300000-0000-0000-0000-000000000001', '51300000-0000-0000-0000-000000000001', 'Member one load', 'pendente', 'media', '41300000-0000-0000-0000-000000000002', '41300000-0000-0000-0000-000000000001'),
  ('71300000-0000-0000-0000-000000000002', '51300000-0000-0000-0000-000000000001', 'Member two load A', 'pendente', 'media', '41300000-0000-0000-0000-000000000003', '41300000-0000-0000-0000-000000000001'),
  ('71300000-0000-0000-0000-000000000003', '51300000-0000-0000-0000-000000000001', 'Member two load B', 'em_andamento', 'media', '41300000-0000-0000-0000-000000000003', '41300000-0000-0000-0000-000000000001');

SELECT is(
  public.select_task_distribution_assignee(
    '51300000-0000-0000-0000-000000000001', 'JURÍDICO', 'ANALISTA'
  ),
  '41300000-0000-0000-0000-000000000003'::uuid,
  'the lowest proportional workload wins despite a larger raw task count'
);
SELECT isnt(
  public.select_task_distribution_assignee(
    '51300000-0000-0000-0000-000000000001', 'Jurídico', 'Analista'
  ),
  '41300000-0000-0000-0000-000000000004'::uuid,
  'viewer profiles are never eligible'
);
SELECT is(
  public.select_task_distribution_assignee(
    '51300000-0000-0000-0000-000000000002', 'Jurídico', 'Analista'
  ),
  '41300000-0000-0000-0000-000000000005'::uuid,
  'selection never crosses the organization boundary'
);

INSERT INTO public.automation_rules(
  id, organization_id, name, trigger_type, conditions, action_type,
  action_config, is_active, created_by
) VALUES (
  '81300000-0000-0000-0000-000000000001',
  '51300000-0000-0000-0000-000000000001',
  'Distribute fixture', 'monitoring.created', '[]', 'create_task',
  '{"title":"Distributed automatically","priority":"media","status":"pendente","due_in_days":1,"assignee_mode":"least_loaded","distribution_sector":"Jurídico","distribution_function":"Analista"}',
  true, '41300000-0000-0000-0000-000000000001'
);

SELECT is(
  public.process_automation_event(
    '51300000-0000-0000-0000-000000000001',
    'monitoring.created', 'monitoring',
    '91300000-0000-0000-0000-000000000001',
    '{"status":"ativo"}', NULL, 0, 'fixture-1'
  ),
  1,
  'an event rule creates one distributed task'
);
SELECT is(
  (
    SELECT assignee_id
    FROM public.tasks
    WHERE title = 'Distributed automatically'
  ),
  '41300000-0000-0000-0000-000000000003'::uuid,
  'event-created task uses the shared workload selector'
);

UPDATE public.organization_members
SET automatic_task_capacity = CASE user_id
  WHEN '41300000-0000-0000-0000-000000000002' THEN 1
  ELSE 3
END
WHERE organization_id = '51300000-0000-0000-0000-000000000001'
  AND user_id IN (
    '41300000-0000-0000-0000-000000000002',
    '41300000-0000-0000-0000-000000000003'
  );

SELECT is(
  public.process_automation_event(
    '51300000-0000-0000-0000-000000000001',
    'monitoring.created', 'monitoring',
    '91300000-0000-0000-0000-000000000002',
    '{"status":"ativo"}', NULL, 0, 'fixture-2'
  ),
  0,
  'no task is created when every matching member reached capacity'
);
SELECT is(
  (
    SELECT error_message
    FROM public.automation_executions
    WHERE entity_id = '91300000-0000-0000-0000-000000000002'
  ),
  'NO_ELIGIBLE_ASSIGNEE',
  'capacity failure remains visible in automation history'
);

SELECT * FROM finish();
ROLLBACK;
