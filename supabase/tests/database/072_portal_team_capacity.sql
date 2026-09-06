BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_column(
  'public', 'organization_members', 'receives_portal_communications',
  'team member portal availability exists'
);
SELECT has_column(
  'public', 'organization_members', 'portal_communication_capacity',
  'team member portal capacity exists'
);
SELECT has_column(
  'public', 'organization_members', 'last_portal_communication_assigned_at',
  'team member last portal assignment timestamp exists'
);
SELECT has_function(
  'public', 'update_member_portal_communication_distribution',
  ARRAY['uuid', 'integer', 'boolean']
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_member_portal_communication_distribution(uuid,integer,boolean)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.select_portal_communication_assignee(uuid)',
    'EXECUTE'
  ),
  'authenticated users only receive the guarded configuration RPC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19700000-0000-0000-0000-000000000001', 'capacity-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000002', 'capacity-operator-a@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000003', 'capacity-operator-b@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000004', 'capacity-viewer@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000005', 'capacity-client@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29700000-0000-0000-0000-000000000001',
  'Portal Capacity Tenant',
  '19700000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(
  id, organization_id, user_id, role, is_active,
  receives_portal_communications, portal_communication_capacity
) VALUES
  ('69700000-0000-0000-0000-000000000001', '29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000001', 'proprietario', true, false, 20),
  ('69700000-0000-0000-0000-000000000002', '29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000002', 'operacional', true, true, 1),
  ('69700000-0000-0000-0000-000000000003', '29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000003', 'operacional', true, false, 2),
  ('69700000-0000-0000-0000-000000000004', '29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000004', 'visualizador', true, false, 20);
INSERT INTO public.organization_settings(
  organization_id, auto_assign_portal_communications
) VALUES (
  '29700000-0000-0000-0000-000000000001', true
) ON CONFLICT (organization_id) DO UPDATE
SET auto_assign_portal_communications = EXCLUDED.auto_assign_portal_communications;
INSERT INTO public.clients(id, organization_id, name, email, created_by)
VALUES (
  '39700000-0000-0000-0000-000000000001',
  '29700000-0000-0000-0000-000000000001',
  'Cliente Capacidade',
  'capacity-client@fluxa.test',
  '19700000-0000-0000-0000-000000000001'
);
INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority,
  assigned_to, created_by
) VALUES (
  '49700000-0000-0000-0000-000000000001',
  '29700000-0000-0000-0000-000000000001',
  '39700000-0000-0000-0000-000000000001',
  'Capacidade preenchida', 'interno', 'aberta', 'normal',
  '19700000-0000-0000-0000-000000000002',
  '19700000-0000-0000-0000-000000000001'
);

SELECT is(
  public.select_portal_communication_assignee(
    '29700000-0000-0000-0000-000000000001'
  ),
  NULL::uuid,
  'paused and at-capacity members are skipped'
);

SELECT set_config(
  'request.jwt.claim.sub', '19700000-0000-0000-0000-000000000001', true
);
SELECT lives_ok(
  $$SELECT public.update_member_portal_communication_distribution(
    '69700000-0000-0000-0000-000000000003', 2, true
  )$$,
  'owner can make an eligible member available'
);
SELECT is(
  public.select_portal_communication_assignee(
    '29700000-0000-0000-0000-000000000001'
  ),
  '19700000-0000-0000-0000-000000000003'::uuid,
  'an available member below capacity is selected'
);
SELECT ok(
  (SELECT last_portal_communication_assigned_at IS NOT NULL
     FROM public.organization_members
    WHERE id = '69700000-0000-0000-0000-000000000003'),
  'selection records the fair-distribution timestamp'
);
SELECT throws_ok(
  $$SELECT public.update_member_portal_communication_distribution(
    '69700000-0000-0000-0000-000000000004', 20, true
  )$$,
  'P0001',
  'ROLE_NOT_ELIGIBLE',
  'a viewer cannot be enabled for portal distribution'
);
SELECT is(
  (SELECT count(*) FROM public.audit_logs
    WHERE entity_id = '69700000-0000-0000-0000-000000000003'
      AND action = 'member.portal_communication_distribution_updated'),
  1::bigint,
  'configuration changes are audited'
);

SELECT * FROM finish();
ROLLBACK;
