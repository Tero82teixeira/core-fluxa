BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.staff_client_portal_service_center(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.staff_client_portal_service_center(uuid)',
    'EXECUTE'
  ),
  'the service center is callable only by authenticated identities'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19400000-0000-0000-0000-000000000001', 'owner-service-center@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000002', 'operator-service-center@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000003', 'viewer-service-center@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19400000-0000-0000-0000-000000000004', 'client-service-center@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29400000-0000-0000-0000-000000000001',
  'Portal Service Center',
  '19400000-0000-0000-0000-000000000001'
);

INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000002', 'operacional', true),
  ('29400000-0000-0000-0000-000000000001', '19400000-0000-0000-0000-000000000003', 'visualizador', true);

INSERT INTO public.clients(id, organization_id, name, email)
VALUES (
  '39400000-0000-0000-0000-000000000001',
  '29400000-0000-0000-0000-000000000001',
  'Cliente da Central',
  'client-service-center@fluxa.test'
);

INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority, created_by
) VALUES (
  '49400000-0000-0000-0000-000000000001',
  '29400000-0000-0000-0000-000000000001',
  '39400000-0000-0000-0000-000000000001',
  'Mensagem do portal',
  'interno',
  'aguardando_equipe',
  'alta',
  '19400000-0000-0000-0000-000000000001'
);

INSERT INTO public.client_portal_communication_shares(
  organization_id, client_id, thread_id, is_shared, opened_by_client, shared_at
) VALUES (
  '29400000-0000-0000-0000-000000000001',
  '39400000-0000-0000-0000-000000000001',
  '49400000-0000-0000-0000-000000000001',
  true,
  true,
  now()
);

INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by, occurred_at,
  is_internal, metadata
) VALUES (
  '29400000-0000-0000-0000-000000000001',
  '49400000-0000-0000-0000-000000000001',
  'mensagem',
  'Preciso de atendimento',
  '19400000-0000-0000-0000-000000000004',
  now(),
  false,
  '{"source":"client_portal"}'::jsonb
);

INSERT INTO public.client_portal_document_requests(
  id, organization_id, client_id, title, due_date, status, created_by
) VALUES (
  '59400000-0000-0000-0000-000000000001',
  '29400000-0000-0000-0000-000000000001',
  '39400000-0000-0000-0000-000000000001',
  'Comprovante atualizado',
  CURRENT_DATE - 1,
  'pending',
  '19400000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19400000-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT count(*)::integer FROM public.staff_client_portal_service_center(
    '29400000-0000-0000-0000-000000000001'
  )),
  2,
  'owner sees shared conversations and active document requests'
);
SELECT is(
  (SELECT unread_count::integer FROM public.staff_client_portal_service_center(
    '29400000-0000-0000-0000-000000000001'
  ) WHERE item_kind = 'communication'),
  1,
  'client messages newer than the current staff read receipt are counted'
);
SELECT is(
  (SELECT priority FROM public.staff_client_portal_service_center(
    '29400000-0000-0000-0000-000000000001'
  ) WHERE item_kind = 'document_request'),
  'urgente',
  'overdue document requests are prioritized'
);

SELECT set_config('request.jwt.claim.sub', '19400000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.staff_client_portal_service_center(
    '29400000-0000-0000-0000-000000000001'
  ) WHERE item_kind = 'communication'),
  1,
  'operational staff sees the shared conversation queue'
);
SELECT is(
  (SELECT count(*)::integer FROM public.staff_client_portal_service_center(
    '29400000-0000-0000-0000-000000000001'
  ) WHERE item_kind = 'document_request'),
  0,
  'operational staff never receives document review metadata'
);

SELECT set_config('request.jwt.claim.sub', '19400000-0000-0000-0000-000000000003', true);
SELECT throws_ok(
  $$SELECT * FROM public.staff_client_portal_service_center(
    '29400000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'COMMUNICATION_WRITE_PERMISSION_DENIED',
  'viewer cannot access the service center'
);

SELECT * FROM finish();
ROLLBACK;
