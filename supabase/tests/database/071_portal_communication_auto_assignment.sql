BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_column(
  'public',
  'organization_settings',
  'auto_assign_portal_communications',
  'organization setting for portal auto-assignment exists'
);
SELECT has_function(
  'public',
  'select_portal_communication_assignee',
  ARRAY['uuid'],
  'private least-workload selector exists'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.select_portal_communication_assignee(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.select_portal_communication_assignee(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.select_portal_communication_assignee(uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'postgres',
    'public.select_portal_communication_assignee(uuid)',
    'EXECUTE'
  ),
  'only postgres can invoke the assignment selector directly'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19600000-0000-0000-0000-000000000001', 'assignment-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000002', 'assignment-operator-a@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000003', 'assignment-operator-b@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19600000-0000-0000-0000-000000000004', 'assignment-client@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29600000-0000-0000-0000-000000000001',
  'Portal Assignment Tenant',
  '19600000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000002', 'operacional', true),
  ('29600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000003', 'gestor', true);
INSERT INTO public.organization_settings(
  organization_id, auto_assign_portal_communications
) VALUES (
  '29600000-0000-0000-0000-000000000001', true
) ON CONFLICT (organization_id) DO UPDATE
SET auto_assign_portal_communications = EXCLUDED.auto_assign_portal_communications;
INSERT INTO public.clients(id, organization_id, name, email, created_by)
VALUES (
  '39600000-0000-0000-0000-000000000001',
  '29600000-0000-0000-0000-000000000001',
  'Cliente Distribuição',
  'assignment-client@fluxa.test',
  '19600000-0000-0000-0000-000000000001'
);

INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority,
  assigned_to, created_by, updated_at
) VALUES
  ('49600000-0000-0000-0000-000000000001', '29600000-0000-0000-0000-000000000001', '39600000-0000-0000-0000-000000000001', 'Carga existente', 'interno', 'aberta', 'normal', '19600000-0000-0000-0000-000000000002', '19600000-0000-0000-0000-000000000001', '2030-01-01 09:00:00+00'),
  ('49600000-0000-0000-0000-000000000002', '29600000-0000-0000-0000-000000000001', '39600000-0000-0000-0000-000000000001', 'Novo atendimento balanceado', 'interno', 'aguardando_equipe', 'normal', NULL, '19600000-0000-0000-0000-000000000001', '2030-01-01 10:00:00+00'),
  ('49600000-0000-0000-0000-000000000003', '29600000-0000-0000-0000-000000000001', '39600000-0000-0000-0000-000000000001', 'Responsável preservado', 'interno', 'aguardando_equipe', 'normal', '19600000-0000-0000-0000-000000000001', '19600000-0000-0000-0000-000000000001', '2030-01-01 10:00:00+00'),
  ('49600000-0000-0000-0000-000000000004', '29600000-0000-0000-0000-000000000001', '39600000-0000-0000-0000-000000000001', 'Distribuição desativada', 'interno', 'aguardando_equipe', 'normal', NULL, '19600000-0000-0000-0000-000000000001', '2030-01-01 10:00:00+00');

INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by, occurred_at,
  is_internal, metadata
) VALUES (
  '29600000-0000-0000-0000-000000000001',
  '49600000-0000-0000-0000-000000000002',
  'mensagem',
  'Preciso de atendimento',
  '19600000-0000-0000-0000-000000000004',
  '2030-01-01 10:00:00+00',
  false,
  '{"source":"client_portal"}'::jsonb
);
SELECT is(
  (SELECT assigned_to FROM public.communication_threads
    WHERE id = '49600000-0000-0000-0000-000000000002'),
  '19600000-0000-0000-0000-000000000003'::uuid,
  'lower open workload receives the new portal conversation'
);
SELECT is(
  (SELECT count(*) FROM public.notifications
    WHERE entity_id = '49600000-0000-0000-0000-000000000002'
      AND user_id = '19600000-0000-0000-0000-000000000003'
      AND dedupe_key LIKE 'portal-auto-assignment:%'),
  1::bigint,
  'selected staff member receives one internal notification'
);
SELECT is(
  (SELECT count(*) FROM public.audit_logs
    WHERE entity_id = '49600000-0000-0000-0000-000000000002'
      AND action = 'communication.assignee.auto_assigned'),
  1::bigint,
  'automatic assignment is audited'
);

INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by,
  is_internal, metadata
) VALUES (
  '29600000-0000-0000-0000-000000000001',
  '49600000-0000-0000-0000-000000000003',
  'mensagem',
  'Não troque o responsável',
  '19600000-0000-0000-0000-000000000004',
  false,
  '{"source":"client_portal"}'::jsonb
);
SELECT is(
  (SELECT assigned_to FROM public.communication_threads
    WHERE id = '49600000-0000-0000-0000-000000000003'),
  '19600000-0000-0000-0000-000000000001'::uuid,
  'an existing assignee is never replaced'
);

UPDATE public.organization_settings
SET auto_assign_portal_communications = false
WHERE organization_id = '29600000-0000-0000-0000-000000000001';
INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by,
  is_internal, metadata
) VALUES (
  '29600000-0000-0000-0000-000000000001',
  '49600000-0000-0000-0000-000000000004',
  'mensagem',
  'Deixe para triagem manual',
  '19600000-0000-0000-0000-000000000004',
  false,
  '{"source":"client_portal"}'::jsonb
);
SELECT is(
  (SELECT assigned_to FROM public.communication_threads
    WHERE id = '49600000-0000-0000-0000-000000000004'),
  NULL::uuid,
  'disabled setting leaves the conversation unassigned'
);

SELECT * FROM finish();
ROLLBACK;
