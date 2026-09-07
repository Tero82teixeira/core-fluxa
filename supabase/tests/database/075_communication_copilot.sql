BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_column(
  'public', 'organization_settings', 'communication_ai_enabled',
  'organization opt-in for the communication copilot exists'
);
SELECT has_function(
  'public', 'get_communication_copilot_settings', ARRAY['uuid'],
  'guarded copilot settings reader exists'
);
SELECT has_function(
  'public', 'update_communication_copilot_settings', ARRAY['uuid', 'boolean'],
  'guarded copilot settings writer exists'
);
SELECT has_function(
  'public', 'prepare_communication_copilot', ARRAY['uuid', 'text'],
  'least-privilege context RPC exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.prepare_communication_copilot(uuid,text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.prepare_communication_copilot(uuid,text)', 'EXECUTE'
  ),
  'only authenticated identities can request copilot context'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  ('19700000-0000-0000-0000-000000000001', 'copilot-owner@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000002', 'copilot-operator@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000003', 'copilot-viewer@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('19700000-0000-0000-0000-000000000004', 'copilot-outsider@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations(id, legal_name, created_by)
VALUES (
  '29700000-0000-0000-0000-000000000001',
  'Copilot Tenant',
  '19700000-0000-0000-0000-000000000001'
);
INSERT INTO public.organization_members(organization_id, user_id, role, is_active)
VALUES
  ('29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000001', 'proprietario', true),
  ('29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000002', 'operacional', true),
  ('29700000-0000-0000-0000-000000000001', '19700000-0000-0000-0000-000000000003', 'visualizador', true);
INSERT INTO public.organization_settings(organization_id, communication_ai_enabled)
VALUES ('29700000-0000-0000-0000-000000000001', false)
ON CONFLICT (organization_id) DO UPDATE
SET communication_ai_enabled = EXCLUDED.communication_ai_enabled;
INSERT INTO public.clients(id, organization_id, name, email, created_by)
VALUES (
  '39700000-0000-0000-0000-000000000001',
  '29700000-0000-0000-0000-000000000001',
  'Nome que não deve ir para a IA',
  'private-client@fluxa.test',
  '19700000-0000-0000-0000-000000000001'
);
INSERT INTO public.communication_threads(
  id, organization_id, client_id, subject, channel, status, priority, created_by
) VALUES (
  '49700000-0000-0000-0000-000000000001',
  '29700000-0000-0000-0000-000000000001',
  '39700000-0000-0000-0000-000000000001',
  'Atualização do atendimento',
  'interno', 'aguardando_equipe', 'normal',
  '19700000-0000-0000-0000-000000000001'
);
INSERT INTO public.communication_entries(
  organization_id, thread_id, entry_type, content, created_by,
  is_internal, metadata
) VALUES
  (
    '29700000-0000-0000-0000-000000000001',
    '49700000-0000-0000-0000-000000000001',
    'mensagem', 'Mensagem pública do cliente',
    '19700000-0000-0000-0000-000000000001', false,
    '{"source":"client_portal"}'::jsonb
  ),
  (
    '29700000-0000-0000-0000-000000000001',
    '49700000-0000-0000-0000-000000000001',
    'nota_interna', 'SEGREDO_INTERNO_NUNCA_ENVIAR',
    '19700000-0000-0000-0000-000000000001', true, '{}'::jsonb
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19700000-0000-0000-0000-000000000002', true
);
SELECT throws_ok(
  $$SELECT public.prepare_communication_copilot(
    '49700000-0000-0000-0000-000000000001', 'assist'
  )$$,
  '42501', 'COMMUNICATION_COPILOT_DISABLED',
  'copilot cannot run before organization opt-in'
);

SELECT set_config(
  'request.jwt.claim.sub', '19700000-0000-0000-0000-000000000001', true
);
SELECT lives_ok(
  $$SELECT public.update_communication_copilot_settings(
    '29700000-0000-0000-0000-000000000001', true
  )$$,
  'owner can opt the organization into AI processing'
);

SELECT set_config(
  'request.jwt.claim.sub', '19700000-0000-0000-0000-000000000002', true
);
SELECT is(
  public.prepare_communication_copilot(
    '49700000-0000-0000-0000-000000000001', 'assist'
  )->'entries'->0->>'content',
  'Mensagem pública do cliente',
  'operational staff receives only the public conversation context'
);
SELECT is(
  public.prepare_communication_copilot(
    '49700000-0000-0000-0000-000000000001', 'review'
  )->'entries'->0->>'author',
  'cliente',
  'portal messages are identified without exposing client identity'
);

SELECT set_config(
  'request.jwt.claim.sub', '19700000-0000-0000-0000-000000000003', true
);
SELECT throws_ok(
  $$SELECT public.prepare_communication_copilot(
    '49700000-0000-0000-0000-000000000001', 'assist'
  )$$,
  'P0001', 'COMMUNICATION_WRITE_PERMISSION_DENIED',
  'viewer cannot submit organization data for AI processing'
);
SELECT throws_ok(
  $$SELECT public.update_communication_copilot_settings(
    '29700000-0000-0000-0000-000000000001', false
  )$$,
  '42501', 'COMMUNICATION_COPILOT_SETTINGS_DENIED',
  'viewer cannot change the AI opt-in'
);

SELECT set_config(
  'request.jwt.claim.sub', '19700000-0000-0000-0000-000000000002', true
);
SELECT ok(
  NOT (
    public.prepare_communication_copilot(
      '49700000-0000-0000-0000-000000000001', 'assist'
    )::text LIKE '%SEGREDO_INTERNO_NUNCA_ENVIAR%'
  ),
  'internal notes are never returned by the context RPC'
);

RESET ROLE;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.audit_logs
     WHERE action LIKE 'communication.copilot.%'
       AND metadata::text LIKE '%SEGREDO_INTERNO_NUNCA_ENVIAR%'
  ),
  'copilot audit never stores communication content'
);

SELECT * FROM finish();
ROLLBACK;
