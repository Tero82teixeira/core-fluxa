BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.client_portal_notifications', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_notifications', 'INSERT'),
  'portal notifications are not exposed as a direct browser table'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.client_portal_notifications()', 'EXECUTE')
  AND has_function_privilege(
    'authenticated', 'public.mark_client_portal_notification_read(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege('anon', 'public.client_portal_notifications()', 'EXECUTE'),
  'only authenticated identities may call the portal notification RPCs'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19200000-0000-0000-0000-000000000001', 'owner-notification@fluxa.test',
   '{"full_name":"Notification Owner"}', 'authenticated', 'authenticated', '', now()),
  ('19200000-0000-0000-0000-000000000002', 'portal-notification@fluxa.test',
   '{"full_name":"Notification Portal"}', 'authenticated', 'authenticated', '', now()),
  ('19200000-0000-0000-0000-000000000003', 'outsider-notification@fluxa.test',
   '{"full_name":"Notification Outsider"}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES ('29200000-0000-0000-0000-000000000001', 'Portal Notifications',
        '19200000-0000-0000-0000-000000000001');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES ('29200000-0000-0000-0000-000000000001',
        '19200000-0000-0000-0000-000000000001', 'proprietario', true);
INSERT INTO public.clients(id, organization_id, name, email)
VALUES ('39200000-0000-0000-0000-000000000001',
        '29200000-0000-0000-0000-000000000001', 'Notification Client',
        'portal-notification@fluxa.test');
INSERT INTO public.client_portal_access(
  id, organization_id, client_id, user_id, email, is_active, invited_by
) VALUES (
  '69200000-0000-0000-0000-000000000001',
  '29200000-0000-0000-0000-000000000001',
  '39200000-0000-0000-0000-000000000001',
  '19200000-0000-0000-0000-000000000002',
  'portal-notification@fluxa.test', true,
  '19200000-0000-0000-0000-000000000001'
);

INSERT INTO public.processes(id, organization_id, client_id, code, title)
VALUES ('49200000-0000-0000-0000-000000000001',
        '29200000-0000-0000-0000-000000000001',
        '39200000-0000-0000-0000-000000000001', 'NOT-001', 'Processo avisado');
INSERT INTO public.client_portal_process_shares(
  organization_id, client_id, process_id, is_shared, shared_by, shared_at
) VALUES (
  '29200000-0000-0000-0000-000000000001',
  '39200000-0000-0000-0000-000000000001',
  '49200000-0000-0000-0000-000000000001', true,
  '19200000-0000-0000-0000-000000000001', now()
);

INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority, created_by
) VALUES (
  '59200000-0000-0000-0000-000000000001',
  '29200000-0000-0000-0000-000000000001',
  '39200000-0000-0000-0000-000000000001', 'Resposta avisada', 'interno',
  'aguardando_equipe', 'normal', '19200000-0000-0000-0000-000000000001'
);
INSERT INTO public.client_portal_communication_shares(
  organization_id, client_id, thread_id, is_shared, opened_by_client, shared_at
) VALUES (
  '29200000-0000-0000-0000-000000000001',
  '39200000-0000-0000-0000-000000000001',
  '59200000-0000-0000-0000-000000000001', true, true, now()
);
INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by, is_internal
) VALUES
  ('29200000-0000-0000-0000-000000000001',
   '59200000-0000-0000-0000-000000000001', 'nota_interna', 'Segredo',
   '19200000-0000-0000-0000-000000000001', true),
  ('29200000-0000-0000-0000-000000000001',
   '59200000-0000-0000-0000-000000000001', 'mensagem', 'Resposta pública',
   '19200000-0000-0000-0000-000000000001', false);

SELECT is(
  (SELECT status::text FROM public.communication_threads
    WHERE id = '59200000-0000-0000-0000-000000000001'),
  'aguardando_cliente',
  'a public company reply automatically waits for the client'
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_notifications),
  2,
  'only the process share and public company message generated notifications'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19200000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_notifications()),
  2,
  'the linked client sees its authorized notifications'
);
SELECT lives_ok(
  $$SELECT public.mark_client_portal_notification_read(
    (SELECT notification_id FROM public.client_portal_notifications() LIMIT 1)
  )$$,
  'the linked client can mark its notification as read'
);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_notifications() WHERE read_at IS NOT NULL),
  1,
  'the read state is returned to the linked client'
);

SELECT set_config('request.jwt.claim.sub', '19200000-0000-0000-0000-000000000003', true);
SELECT is(
  (SELECT count(*)::integer FROM public.client_portal_notifications()),
  0,
  'an unrelated authenticated identity sees no portal notifications'
);
SELECT throws_ok(
  $$SELECT public.mark_client_portal_notification_read(
    '79200000-0000-0000-0000-000000000001'
  )$$,
  '42501', NULL,
  'an unrelated identity cannot mark a client notification as read'
);

SELECT * FROM finish();
ROLLBACK;
