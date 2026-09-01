BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table(
  'public', 'support_request_messages',
  'support request message table exists'
);
SELECT has_function(
  'public', 'platform_support_requests', ARRAY['text', 'integer'],
  'platform support inbox RPC exists'
);
SELECT has_function(
  'public', 'platform_support_open_count', ARRAY[]::text[],
  'platform support counter RPC exists'
);
SELECT has_function(
  'public', 'support_request_thread', ARRAY['uuid'],
  'support request thread RPC exists'
);
SELECT has_function(
  'public', 'reply_support_request', ARRAY['uuid', 'text', 'text'],
  'support reply RPC exists'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.support_request_messages', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.support_request_messages', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.support_request_messages', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.support_request_messages', 'DELETE'),
  'browser sessions have no direct access to support messages'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.platform_support_requests(text, integer)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated', 'public.support_request_thread(uuid)', 'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated', 'public.reply_support_request(uuid, text, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'public.platform_support_requests(text, integer)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role', 'public.platform_support_requests(text, integer)', 'EXECUTE'
  ),
  'support RPCs are exposed only to authenticated sessions and enforce identity internally'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19650000-0000-0000-0000-000000000001', 'platform-support@fluxa.test',
    '{"full_name":"Platform Support"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19650000-0000-0000-0000-000000000002', 'support-owner@fluxa.test',
    '{"full_name":"Support Owner"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19650000-0000-0000-0000-000000000003', 'support-requester@fluxa.test',
    '{"full_name":"Support Requester"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19650000-0000-0000-0000-000000000004', 'support-outsider@fluxa.test',
    '{"full_name":"Support Outsider"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.profiles(id, full_name, email) VALUES
  (
    '19650000-0000-0000-0000-000000000001',
    'Platform Support', 'platform-support@fluxa.test'
  ),
  (
    '19650000-0000-0000-0000-000000000002',
    'Support Owner', 'support-owner@fluxa.test'
  ),
  (
    '19650000-0000-0000-0000-000000000003',
    'Support Requester', 'support-requester@fluxa.test'
  ),
  (
    '19650000-0000-0000-0000-000000000004',
    'Support Outsider', 'support-outsider@fluxa.test'
  )
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;

INSERT INTO public.organizations(id, legal_name, trade_name, created_by) VALUES
  (
    '29650000-0000-0000-0000-000000000001',
    'Support Customer Ltda', 'Support Customer',
    '19650000-0000-0000-0000-000000000002'
  ),
  (
    '29650000-0000-0000-0000-000000000002',
    'Outsider Company Ltda', 'Outsider Company',
    '19650000-0000-0000-0000-000000000004'
  );

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES
  (
    '29650000-0000-0000-0000-000000000001',
    '19650000-0000-0000-0000-000000000002', 'proprietario', true
  ),
  (
    '29650000-0000-0000-0000-000000000001',
    '19650000-0000-0000-0000-000000000003', 'operacional', true
  ),
  (
    '29650000-0000-0000-0000-000000000002',
    '19650000-0000-0000-0000-000000000004', 'proprietario', true
  );

INSERT INTO public.platform_admins(user_id, created_by) VALUES (
  '19650000-0000-0000-0000-000000000001',
  '19650000-0000-0000-0000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '19650000-0000-0000-0000-000000000003', true
);
SELECT lives_ok(
  $$SELECT public.create_support_request(
    '29650000-0000-0000-0000-000000000001',
    'Preciso de ajuda no financeiro',
    'Financeiro',
    'O lançamento não aparece na lista de contas a receber.',
    'alta',
    'Financeiro',
    '/financeiro'
  )$$,
  'customer can open a support request through the existing secure flow'
);
SELECT set_config(
  'test.support_request_id',
  (SELECT id::text FROM public.support_requests WHERE created_by = auth.uid()),
  true
);

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.support_request_thread(
        current_setting('test.support_request_id')::uuid
      )
  ),
  0,
  'requester can read the initially empty support thread'
);
SELECT lives_ok(
  $$SELECT public.reply_support_request(
    current_setting('test.support_request_id')::uuid,
    'O problema acontece ao aplicar o filtro de vencimento.',
    NULL
  )$$,
  'requester can add information to the own ticket'
);
SELECT is(
  (
    SELECT status
      FROM public.support_requests
     WHERE created_by = auth.uid()
  ),
  'em_analise',
  'customer reply moves the request to analysis'
);

SELECT set_config(
  'request.jwt.claim.sub', '19650000-0000-0000-0000-000000000004', true
);
SELECT throws_ok(
  $$SELECT * FROM public.platform_support_requests(NULL, 100)$$,
  '42501', 'PLATFORM_ADMIN_REQUIRED',
  'ordinary organization owners cannot open the platform support inbox'
);
SELECT throws_ok(
  $$SELECT * FROM public.support_request_thread(
    current_setting('test.support_request_id')::uuid
  )$$,
  '42501', 'SUPPORT_REQUEST_ACCESS_DENIED',
  'members from another organization cannot read the conversation'
);

SELECT set_config(
  'request.jwt.claim.sub', '19650000-0000-0000-0000-000000000001', true
);
SELECT is(
  (SELECT count(*)::integer FROM public.platform_support_requests(NULL, 100)),
  1,
  'platform administrator sees requests from customer organizations'
);
SELECT is(
  (SELECT public.platform_support_open_count()::integer),
  1,
  'platform counter includes requests that need service'
);
SELECT is(
  (
    SELECT organization_name
      FROM public.platform_support_requests(NULL, 100)
     LIMIT 1
  ),
  'Support Customer',
  'platform inbox identifies the customer organization'
);
SELECT lives_ok(
  $$SELECT public.reply_support_request(
    current_setting('test.support_request_id')::uuid,
    'Verificamos o filtro. Atualize a página e selecione Ver ativos.',
    'resolvido'
  )$$,
  'platform administrator can answer and resolve the customer request'
);
SELECT is(
  (
    SELECT status
      FROM public.platform_support_requests(NULL, 100)
     WHERE id = current_setting('test.support_request_id')::uuid
  ),
  'resolvido',
  'platform answer applies the selected support status'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.support_request_thread(
        current_setting('test.support_request_id')::uuid
      )
  ),
  2,
  'platform administrator sees the complete customer conversation'
);
SELECT is(
  (
    SELECT author_name
      FROM public.support_request_thread(
        current_setting('test.support_request_id')::uuid
      )
     WHERE author_kind = 'platform'
  ),
  'Equipe FLUXA',
  'customer-facing thread identifies platform replies without exposing administrator identity'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
      FROM public.notifications
     WHERE user_id = '19650000-0000-0000-0000-000000000003'
       AND entity_type = 'support_request'
       AND title = 'Nova resposta do suporte FLUXA'
  ),
  1,
  'platform reply notifies the original requester inside FLUXA'
);
SELECT is(
  (
    SELECT count(*)::integer
      FROM public.audit_logs
     WHERE organization_id = '29650000-0000-0000-0000-000000000001'
       AND action IN (
         'support.request.customer_replied',
         'support.request.platform_replied'
       )
  ),
  2,
  'both sides of the support conversation are audited'
);

SELECT * FROM finish();
ROLLBACK;
