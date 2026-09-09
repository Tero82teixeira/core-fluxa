BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public', 'client_portal_faq_articles', 'portal FAQ table exists');
SELECT has_table('public', 'communication_channel_connections', 'channel connection table exists');
SELECT has_table('public', 'communication_channel_messages', 'channel message ledger exists');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.client_portal_faq_articles', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.client_portal_faq_events', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.communication_channel_connections', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.communication_channel_messages', 'SELECT'),
  'sensitive tables are reachable only through guarded RPCs'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.prepare_communication_channel_send(uuid,text,uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated', 'public.ingest_communication_channel_message(text,public.communication_channel,text,text,text,text,text,text,timestamp with time zone)', 'EXECUTE'
  ),
  'service-only channel RPCs are not callable by authenticated users'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19770000-0000-0000-0000-000000000001', 'self-service-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19770000-0000-0000-0000-000000000002', 'self-service-client@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19770000-0000-0000-0000-000000000003', 'self-service-outsider@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29770000-0000-0000-0000-000000000001',
  'Self Service Tenant',
  '19770000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES (
  '29770000-0000-0000-0000-000000000001',
  '19770000-0000-0000-0000-000000000001',
  'proprietario', true
);
INSERT INTO public.clients(id, organization_id, name, email, whatsapp, created_by)
VALUES (
  '39770000-0000-0000-0000-000000000001',
  '29770000-0000-0000-0000-000000000001',
  'Cliente do autoatendimento', 'client@self-service.test', '5511999999999',
  '19770000-0000-0000-0000-000000000001'
);
INSERT INTO public.client_portal_access(
  id, organization_id, client_id, user_id, email, invited_by
) VALUES (
  '49770000-0000-0000-0000-000000000001',
  '29770000-0000-0000-0000-000000000001',
  '39770000-0000-0000-0000-000000000001',
  '19770000-0000-0000-0000-000000000002',
  'self-service-client@fluxa.test',
  '19770000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19770000-0000-0000-0000-000000000001', true);
SELECT lives_ok(
  $$SELECT public.save_client_portal_faq_article(
    '29770000-0000-0000-0000-000000000001', NULL,
    'Como envio meu documento?', 'Use a área Pendências do portal.',
    'Documentos', ARRAY['arquivo', 'pendência'], 10, true
  )$$,
  'owner can publish an FAQ article'
);
SELECT lives_ok(
  $$SELECT public.save_communication_channel_connection(
    '29770000-0000-0000-0000-000000000001', 'email',
    'atendimento@self-service.test', 'Atendimento', false
  )$$,
  'owner can configure provider metadata without a credential in the database'
);

SELECT set_config('request.jwt.claim.sub', '19770000-0000-0000-0000-000000000002', true);
SELECT is(
  jsonb_array_length(public.list_my_client_portal_faq_articles(
    '49770000-0000-0000-0000-000000000001'
  )),
  1,
  'portal user sees published content from their own organization'
);
SELECT lives_ok(
  $$SELECT public.record_my_client_portal_faq_event(
    '49770000-0000-0000-0000-000000000001', NULL, 'search', 'documento'
  )$$,
  'portal user can record a bounded self-service event'
);

SELECT set_config('request.jwt.claim.sub', '19770000-0000-0000-0000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.list_my_client_portal_faq_articles(
    '49770000-0000-0000-0000-000000000001'
  )$$,
  '42501', 'PORTAL_ACCESS_NOT_FOUND',
  'another identity cannot read the client portal FAQ through an access id'
);
SELECT throws_ok(
  $$SELECT public.communication_service_metrics(
    '29770000-0000-0000-0000-000000000001', now() - interval '30 days', now()
  )$$,
  'P0001', 'COMMUNICATION_ADMIN_PERMISSION_DENIED',
  'an outsider cannot read management analytics'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
