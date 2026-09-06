BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public', 'claim_portal_communication_thread', ARRAY['uuid'],
  'one-click portal conversation claim RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.claim_portal_communication_thread(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.claim_portal_communication_thread(uuid)',
    'EXECUTE'
  ),
  'only authenticated identities can call the guarded claim RPC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19800000-0000-0000-0000-000000000001', 'triage-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000002', 'triage-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000003', 'triage-viewer@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19800000-0000-0000-0000-000000000004', 'triage-client@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29800000-0000-0000-0000-000000000001',
  'Portal Triage Tenant',
  '19800000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000002', 'operacional', true),
  ('29800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000003', 'visualizador', true);
INSERT INTO public.clients(id, organization_id, name, email, created_by)
VALUES (
  '39800000-0000-0000-0000-000000000001',
  '29800000-0000-0000-0000-000000000001',
  'Cliente Triagem',
  'triage-client@fluxa.test',
  '19800000-0000-0000-0000-000000000001'
);
INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority,
  assigned_to, created_by
) VALUES
  ('49800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', 'Livre para triagem', 'interno', 'aguardando_equipe', 'alta', NULL, '19800000-0000-0000-0000-000000000001'),
  ('49800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', 'Já atribuída', 'interno', 'aberta', 'normal', '19800000-0000-0000-0000-000000000001', '19800000-0000-0000-0000-000000000001'),
  ('49800000-0000-0000-0000-000000000003', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', 'Conversa privada', 'interno', 'aberta', 'normal', NULL, '19800000-0000-0000-0000-000000000001'),
  ('49800000-0000-0000-0000-000000000004', '29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', 'Livre para permissão', 'interno', 'aberta', 'normal', NULL, '19800000-0000-0000-0000-000000000001');
INSERT INTO public.client_portal_communication_shares(
  organization_id, client_id, thread_id, is_shared, opened_by_client, shared_at
) VALUES
  ('29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000001', true, true, now()),
  ('29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000002', true, true, now()),
  ('29800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000004', true, true, now());

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19800000-0000-0000-0000-000000000002', true
);
SELECT lives_ok(
  $$SELECT public.claim_portal_communication_thread(
    '49800000-0000-0000-0000-000000000001'
  )$$,
  'operational staff can claim an unassigned portal conversation'
);
SELECT is(
  (SELECT assigned_to FROM public.communication_threads
    WHERE id = '49800000-0000-0000-0000-000000000001'),
  '19800000-0000-0000-0000-000000000002'::uuid,
  'claim assigns the conversation to the authenticated member'
);
SELECT throws_ok(
  $$SELECT public.claim_portal_communication_thread(
    '49800000-0000-0000-0000-000000000002'
  )$$,
  'P0001',
  'PORTAL_COMMUNICATION_NOT_AVAILABLE_FOR_CLAIM',
  'an existing assignee is never replaced'
);
SELECT throws_ok(
  $$SELECT public.claim_portal_communication_thread(
    '49800000-0000-0000-0000-000000000003'
  )$$,
  'P0001',
  'PORTAL_COMMUNICATION_NOT_AVAILABLE_FOR_CLAIM',
  'a private conversation cannot be claimed through portal triage'
);
SELECT is(
  (SELECT count(*) FROM public.audit_logs
    WHERE entity_id = '49800000-0000-0000-0000-000000000001'
      AND actor_id = '19800000-0000-0000-0000-000000000002'
      AND action = 'communication.assignee.claimed'),
  1::bigint,
  'the one-click claim is audited'
);

SELECT set_config(
  'request.jwt.claim.sub', '19800000-0000-0000-0000-000000000003', true
);
SELECT throws_ok(
  $$SELECT public.claim_portal_communication_thread(
    '49800000-0000-0000-0000-000000000004'
  )$$,
  'P0001',
  'COMMUNICATION_WRITE_PERMISSION_DENIED',
  'a viewer cannot claim a portal conversation'
);

SELECT * FROM finish();
ROLLBACK;
