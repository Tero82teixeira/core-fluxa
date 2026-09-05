BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.client_portal_communication_shares',
    'SELECT'
  )
  AND NOT has_table_privilege(
    'authenticated',
    'public.client_portal_communication_shares',
    'INSERT'
  ),
  'communication shares are not a browser data API'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.client_portal_communication_threads()',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.client_portal_communication_entries(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.client_portal_communication_threads()',
    'EXECUTE'
  ),
  'portal communication RPCs require authentication'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19100000-0000-0000-0000-000000000001',
    'owner-communication@fluxa.test',
    '{"full_name":"Communication Owner"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19100000-0000-0000-0000-000000000002',
    'manager-communication@fluxa.test',
    '{"full_name":"Communication Manager"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19100000-0000-0000-0000-000000000003',
    'portal-communication@fluxa.test',
    '{"full_name":"Communication Portal"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19100000-0000-0000-0000-000000000004',
    'outsider-communication@fluxa.test',
    '{"full_name":"Communication Outsider"}',
    'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29100000-0000-0000-0000-000000000001',
  'Portal Communication',
  '19100000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  (
    '29100000-0000-0000-0000-000000000001',
    '19100000-0000-0000-0000-000000000001',
    'proprietario',
    true
  ),
  (
    '29100000-0000-0000-0000-000000000001',
    '19100000-0000-0000-0000-000000000002',
    'gestor',
    true
  );
INSERT INTO public.clients(id, organization_id, name, email)
VALUES (
  '39100000-0000-0000-0000-000000000001',
  '29100000-0000-0000-0000-000000000001',
  'Communication Client',
  'portal-communication@fluxa.test'
);
INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority, created_by
) VALUES (
  '49100000-0000-0000-0000-000000000001',
  '29100000-0000-0000-0000-000000000001',
  '39100000-0000-0000-0000-000000000001',
  'Conversa liberada',
  'interno',
  'aberta',
  'normal',
  '19100000-0000-0000-0000-000000000001'
);
INSERT INTO public.communication_entries(
  id, organization_id, thread_id, entry_type, content, created_by, is_internal
) VALUES
  (
    '59100000-0000-0000-0000-000000000001',
    '29100000-0000-0000-0000-000000000001',
    '49100000-0000-0000-0000-000000000001',
    'mensagem',
    'Mensagem visível',
    '19100000-0000-0000-0000-000000000001',
    false
  ),
  (
    '59100000-0000-0000-0000-000000000002',
    '29100000-0000-0000-0000-000000000001',
    '49100000-0000-0000-0000-000000000001',
    'nota_interna',
    'Segredo da equipe',
    '19100000-0000-0000-0000-000000000001',
    true
  );
INSERT INTO public.client_portal_access(
  id, organization_id, client_id, user_id, email, is_active, invited_by
) VALUES (
  '69100000-0000-0000-0000-000000000001',
  '29100000-0000-0000-0000-000000000001',
  '39100000-0000-0000-0000-000000000001',
  '19100000-0000-0000-0000-000000000003',
  'portal-communication@fluxa.test',
  true,
  '19100000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '19100000-0000-0000-0000-000000000002',
  true
);
SELECT throws_ok(
  $$SELECT public.set_client_portal_communication_shared(
    '29100000-0000-0000-0000-000000000001',
    '39100000-0000-0000-0000-000000000001',
    '49100000-0000-0000-0000-000000000001',
    true
  )$$,
  '42501',
  NULL,
  'a manager cannot expose an internal conversation'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '19100000-0000-0000-0000-000000000001',
  true
);
SELECT lives_ok(
  $$SELECT public.set_client_portal_communication_shared(
    '29100000-0000-0000-0000-000000000001',
    '39100000-0000-0000-0000-000000000001',
    '49100000-0000-0000-0000-000000000001',
    true
  )$$,
  'an owner can explicitly share a conversation'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '19100000-0000-0000-0000-000000000003',
  true
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_communication_threads()),
  1,
  'the linked client sees the shared conversation'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.client_portal_communication_entries(
        '49100000-0000-0000-0000-000000000001'
      )
  ),
  1,
  'the portal only returns non-internal message entries'
);
SELECT is(
  (
    SELECT content
      FROM public.client_portal_communication_entries(
        '49100000-0000-0000-0000-000000000001'
      )
  ),
  'Mensagem visível',
  'the internal note content never reaches the portal projection'
);
SELECT lives_ok(
  $$SELECT public.create_client_portal_communication_thread(
    '69100000-0000-0000-0000-000000000001',
    'Dúvida do cliente',
    'Preciso de ajuda com meu atendimento.'
  )$$,
  'the client can open a new conversation'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.client_portal_communication_threads()
     WHERE subject = 'Dúvida do cliente'
  ),
  1,
  'a client-created conversation is automatically visible'
);
SELECT lives_ok(
  $$SELECT public.add_client_portal_communication_entry(
    (
      SELECT thread_id
        FROM public.client_portal_communication_threads()
       WHERE subject = 'Dúvida do cliente'
    ),
    'Mensagem adicional do cliente.'
  )$$,
  'the client can reply to its shared conversation'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '19100000-0000-0000-0000-000000000004',
  true
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_communication_threads()),
  0,
  'an unrelated authenticated identity sees no conversations'
);
SELECT throws_ok(
  $$SELECT public.add_client_portal_communication_entry(
    '49100000-0000-0000-0000-000000000001',
    'Tentativa indevida'
  )$$,
  '42501',
  NULL,
  'an unrelated identity cannot reply to the conversation'
);

SELECT * FROM finish();
ROLLBACK;
