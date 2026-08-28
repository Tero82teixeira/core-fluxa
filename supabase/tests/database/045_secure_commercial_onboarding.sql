BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_function(
  'public',
  'update_organization_onboarding',
  ARRAY['uuid', 'integer', 'jsonb', 'jsonb', 'boolean'],
  'secure onboarding RPC exists'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.organizations', 'UPDATE'),
  'authenticated clients cannot update organizations directly'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_organization_onboarding(uuid,integer,jsonb,jsonb,boolean)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.update_organization_onboarding(uuid,integer,jsonb,jsonb,boolean)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.update_organization_onboarding(uuid,integer,jsonb,jsonb,boolean)',
    'EXECUTE'
  ),
  'only authenticated sessions can invoke onboarding'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19540000-0000-0000-0000-000000000001', 'secure-onboarding@fluxa.test',
    '{"full_name":"Onboarding Seguro"}', 'authenticated', 'authenticated', '', now()
  ),
  (
    '19540000-0000-0000-0000-000000000002', 'onboarding-outsider@fluxa.test',
    '{"full_name":"Sem Acesso"}', 'authenticated', 'authenticated', '', now()
  );

INSERT INTO public.organizations(
  id, legal_name, created_by, commercial_status, trial_started_at, trial_ends_at
) VALUES (
  '29540000-0000-0000-0000-000000000001', 'Cadastro Inicial',
  '19540000-0000-0000-0000-000000000001', 'trial', now(), now() + interval '14 days'
);

INSERT INTO public.organization_members(organization_id, user_id, role, is_active) VALUES (
  '29540000-0000-0000-0000-000000000001',
  '19540000-0000-0000-0000-000000000001', 'proprietario', true
);
INSERT INTO public.organization_settings(organization_id) VALUES (
  '29540000-0000-0000-0000-000000000001'
) ON CONFLICT (organization_id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19540000-0000-0000-0000-000000000001', true);

SELECT throws_ok(
  $$UPDATE public.organizations
       SET commercial_status = 'active'
     WHERE id = '29540000-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table organizations',
  'trial owner cannot activate the organization directly'
);
SELECT throws_ok(
  $$SELECT public.update_organization_onboarding(
    '29540000-0000-0000-0000-000000000001', 2, NULL,
    '{"city":"Anchieta","state":"ES"}'::jsonb, false
  )$$,
  '22023', 'ONBOARDING_STEP_OUT_OF_SEQUENCE',
  'onboarding cannot skip the company step'
);
SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29540000-0000-0000-0000-000000000001', 1,
    '{"trade_name":"Empresa Teste 14 Dias","document":"32.955.277/0001-74","phone":"28999410465","whatsapp":"28999410465"}'::jsonb,
    NULL, false
  )$$,
  'owner saves the company step through the RPC'
);
SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29540000-0000-0000-0000-000000000001', 2, NULL,
    '{"city":"Anchieta","state":"ES"}'::jsonb, false
  )$$,
  'owner saves the location step through the RPC'
);
SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29540000-0000-0000-0000-000000000001', 3, NULL,
    '{"main_services":"Gestão","clients_range":"1-10","employees_range":"1-5"}'::jsonb, false
  )$$,
  'owner saves the operation step through the RPC'
);
SELECT lives_ok(
  $$SELECT public.update_organization_onboarding(
    '29540000-0000-0000-0000-000000000001', 3, NULL, NULL, true
  )$$,
  'owner completes onboarding through the RPC'
);
RESET ROLE;

SELECT ok(
  (
    SELECT organization.trade_name = 'Empresa Teste 14 Dias'
       AND organization.document_digits = '32955277000174'
       AND organization.onboarding_step = 3
       AND organization.onboarding_completed
       AND organization.onboarding_completed_at IS NOT NULL
       AND organization.commercial_status = 'trial'
      FROM public.organizations organization
     WHERE organization.id = '29540000-0000-0000-0000-000000000001'
  ),
  'onboarding persists allowed fields without changing the commercial trial'
);
SELECT ok(
  (
    SELECT settings.portal_name = 'Empresa Teste 14 Dias'
       AND settings.city = 'Anchieta'
       AND settings.state = 'ES'
       AND settings.main_services = 'Gestão'
      FROM public.organization_settings settings
     WHERE settings.organization_id = '29540000-0000-0000-0000-000000000001'
  ),
  'onboarding persists company settings through the protected function'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19540000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.update_organization_onboarding(
    '29540000-0000-0000-0000-000000000001', 1,
    '{"trade_name":"Tentativa Externa"}'::jsonb, NULL, false
  )$$,
  '42501', 'ONBOARDING_ACCESS_DENIED',
  'an unrelated user cannot change another organization'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
