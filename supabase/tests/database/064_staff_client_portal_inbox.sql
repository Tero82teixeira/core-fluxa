BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.staff_client_portal_inbox(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.staff_client_portal_inbox(uuid)',
    'EXECUTE'
  ),
  'only authenticated identities may call the staff portal inbox RPC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19300000-0000-0000-0000-000000000001',
    'owner-staff-inbox@fluxa.test',
    '{"full_name":"Staff Inbox Owner"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19300000-0000-0000-0000-000000000002',
    'operational-staff-inbox@fluxa.test',
    '{"full_name":"Staff Inbox Operational"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19300000-0000-0000-0000-000000000003',
    'viewer-staff-inbox@fluxa.test',
    '{"full_name":"Staff Inbox Viewer"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19300000-0000-0000-0000-000000000004',
    'outsider-staff-inbox@fluxa.test',
    '{"full_name":"Staff Inbox Outsider"}',
    'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29300000-0000-0000-0000-000000000001',
  'Staff Portal Inbox',
  '19300000-0000-0000-0000-000000000001'
);

INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  (
    '29300000-0000-0000-0000-000000000001',
    '19300000-0000-0000-0000-000000000001',
    'proprietario',
    true
  ),
  (
    '29300000-0000-0000-0000-000000000001',
    '19300000-0000-0000-0000-000000000002',
    'operacional',
    true
  ),
  (
    '29300000-0000-0000-0000-000000000001',
    '19300000-0000-0000-0000-000000000003',
    'visualizador',
    true
  );

INSERT INTO public.clients(id, organization_id, name, email)
VALUES (
  '39300000-0000-0000-0000-000000000001',
  '29300000-0000-0000-0000-000000000001',
  'Staff Inbox Client',
  'client-staff-inbox@fluxa.test'
);

INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority, created_by
) VALUES
  (
    '49300000-0000-0000-0000-000000000001',
    '29300000-0000-0000-0000-000000000001',
    '39300000-0000-0000-0000-000000000001',
    'Conversa compartilhada',
    'interno',
    'aguardando_equipe',
    'normal',
    '19300000-0000-0000-0000-000000000001'
  ),
  (
    '49300000-0000-0000-0000-000000000002',
    '29300000-0000-0000-0000-000000000001',
    '39300000-0000-0000-0000-000000000001',
    'Conversa interna',
    'interno',
    'aberta',
    'normal',
    '19300000-0000-0000-0000-000000000001'
  );

INSERT INTO public.client_portal_communication_shares(
  organization_id, client_id, thread_id, is_shared, opened_by_client, shared_at
) VALUES (
  '29300000-0000-0000-0000-000000000001',
  '39300000-0000-0000-0000-000000000001',
  '49300000-0000-0000-0000-000000000001',
  true,
  true,
  now()
);

INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by, is_internal,
  occurred_at
) VALUES
  (
    '29300000-0000-0000-0000-000000000001',
    '49300000-0000-0000-0000-000000000001',
    'mensagem',
    'Mensagem pública anterior',
    '19300000-0000-0000-0000-000000000001',
    false,
    now() - interval '1 minute'
  ),
  (
    '29300000-0000-0000-0000-000000000001',
    '49300000-0000-0000-0000-000000000001',
    'nota_interna',
    'Conteúdo sigiloso mais recente',
    '19300000-0000-0000-0000-000000000001',
    true,
    now()
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '19300000-0000-0000-0000-000000000002',
  true
);
SELECT is(
  (SELECT count(*)::integer FROM public.staff_client_portal_inbox(
    '29300000-0000-0000-0000-000000000001'
  )),
  1,
  'operational staff only sees explicitly shared conversations'
);
SELECT is(
  (SELECT last_message FROM public.staff_client_portal_inbox(
    '29300000-0000-0000-0000-000000000001'
  )),
  'Mensagem pública anterior',
  'the inbox preview never exposes the latest internal note'
);
SELECT lives_ok(
  $$SELECT public.add_communication_entry(
    '49300000-0000-0000-0000-000000000001',
    'mensagem',
    'Resposta pública da equipe',
    now(),
    false,
    true,
    '{"source":"staff_quick_chat"}'::jsonb
  )$$,
  'operational staff may answer the client through the existing secure RPC'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '19300000-0000-0000-0000-000000000003',
  true
);
SELECT throws_ok(
  $$SELECT * FROM public.staff_client_portal_inbox(
    '29300000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'COMMUNICATION_WRITE_PERMISSION_DENIED',
  'a viewer cannot access the staff inbox'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '19300000-0000-0000-0000-000000000004',
  true
);
SELECT throws_ok(
  $$SELECT * FROM public.staff_client_portal_inbox(
    '29300000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'COMMUNICATION_WRITE_PERMISSION_DENIED',
  'an unrelated authenticated identity cannot access the staff inbox'
);

SELECT * FROM finish();
ROLLBACK;
