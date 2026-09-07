BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table(
  'public', 'communication_quick_replies',
  'organization-scoped quick replies table exists'
);
SELECT has_function(
  'public', 'list_communication_quick_replies', ARRAY['uuid'],
  'guarded list RPC exists'
);
SELECT has_function(
  'public', 'save_communication_quick_reply',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'boolean'],
  'guarded save RPC exists'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.communication_quick_replies', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.communication_quick_replies', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.communication_quick_replies', 'UPDATE')
  AND has_function_privilege(
    'authenticated', 'public.list_communication_quick_replies(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.list_communication_quick_replies(uuid)', 'EXECUTE'
  ),
  'the table is private and only authenticated identities can call the RPC'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19900000-0000-0000-0000-000000000001', 'quick-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000002', 'quick-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000003', 'quick-viewer@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19900000-0000-0000-0000-000000000004', 'other-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES
  ('29900000-0000-0000-0000-000000000001', 'Quick Reply Tenant', '19900000-0000-0000-0000-000000000001'),
  ('29900000-0000-0000-0000-000000000002', 'Other Quick Reply Tenant', '19900000-0000-0000-0000-000000000004');
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000002', 'operacional', true),
  ('29900000-0000-0000-0000-000000000001', '19900000-0000-0000-0000-000000000003', 'visualizador', true),
  ('29900000-0000-0000-0000-000000000002', '19900000-0000-0000-0000-000000000004', 'proprietario', true);

INSERT INTO public.communication_quick_replies(
  id, organization_id, title, content, category, created_by, updated_by
) VALUES (
  '39900000-0000-0000-0000-000000000002',
  '29900000-0000-0000-0000-000000000002',
  'Modelo do outro tenant', 'Conteúdo privado do outro tenant.', 'Privado',
  '19900000-0000-0000-0000-000000000004',
  '19900000-0000-0000-0000-000000000004'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19900000-0000-0000-0000-000000000001', true
);
SELECT lives_ok(
  $$SELECT public.save_communication_quick_reply(
    '29900000-0000-0000-0000-000000000001', NULL,
    'Documento recebido', 'Olá! Seu documento foi recebido.', 'Documentos', true
  )$$,
  'the owner can create a quick reply'
);
SELECT throws_ok(
  $$SELECT public.save_communication_quick_reply(
    '29900000-0000-0000-0000-000000000001',
    '39900000-0000-0000-0000-000000000002',
    'Tentativa cruzada', 'Este texto nunca deve ser salvo.', 'Privado', true
  )$$,
  'P0001', 'QUICK_REPLY_NOT_FOUND',
  'an owner cannot update a reply from another organization'
);

SELECT set_config(
  'request.jwt.claim.sub', '19900000-0000-0000-0000-000000000002', true
);
SELECT is(
  (SELECT count(*) FROM public.list_communication_quick_replies(
    '29900000-0000-0000-0000-000000000001'
  )),
  1::bigint,
  'operational staff can list only their organization replies'
);
SELECT throws_ok(
  $$SELECT public.save_communication_quick_reply(
    '29900000-0000-0000-0000-000000000001', NULL,
    'Sem permissão', 'Operacional não administra modelos.', 'Geral', true
  )$$,
  'P0001', 'COMMUNICATION_ADMIN_PERMISSION_DENIED',
  'operational staff cannot manage quick replies'
);

SELECT set_config(
  'request.jwt.claim.sub', '19900000-0000-0000-0000-000000000003', true
);
SELECT throws_ok(
  $$SELECT * FROM public.list_communication_quick_replies(
    '29900000-0000-0000-0000-000000000001'
  )$$,
  'P0001', 'COMMUNICATION_WRITE_PERMISSION_DENIED',
  'a viewer cannot read communication quick replies'
);

RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.audit_logs
    WHERE action = 'communication.quick_reply.created'
      AND organization_id = '29900000-0000-0000-0000-000000000001'
      AND actor_id = '19900000-0000-0000-0000-000000000001'),
  1::bigint,
  'quick reply creation is audited'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action LIKE 'communication.quick_reply.%'
       AND metadata::text LIKE '%Seu documento foi recebido%'
  ),
  'audit metadata never copies the message body'
);

SELECT * FROM finish();
ROLLBACK;
