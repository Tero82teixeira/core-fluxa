BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_table('public', 'legal_acceptances', 'legal acceptance table exists');
SELECT has_function(
  'public', 'record_signup_legal_acceptance', ARRAY[]::text[],
  'signup legal acceptance trigger function exists'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.legal_acceptances', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.legal_acceptances', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.legal_acceptances', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.legal_acceptances', 'DELETE'),
  'users can only read their own legal acceptance records'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.record_signup_legal_acceptance()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.record_signup_legal_acceptance()', 'EXECUTE'),
  'clients cannot call the internal recording function'
);

INSERT INTO auth.users(
  id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at
) VALUES
  (
    '19600000-0000-0000-0000-000000000001', 'legal-company@fluxa.test',
    '{"full_name":"Legal Empresa","legal_accepted":true,"legal_terms_version":"2026-08-30","legal_privacy_version":"2026-08-30","legal_acceptance_source":"company_signup"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19600000-0000-0000-0000-000000000002', 'legal-invite@fluxa.test',
    '{"full_name":"Legal Convite","legal_accepted":true,"legal_terms_version":"2026-08-30","legal_privacy_version":"2026-08-30","legal_acceptance_source":"invitation"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19600000-0000-0000-0000-000000000003', 'legal-missing@fluxa.test',
    '{"full_name":"Sem Aceite"}',
    'authenticated', 'authenticated', '', now()
  ),
  (
    '19600000-0000-0000-0000-000000000004', 'legal-old@fluxa.test',
    '{"full_name":"Versão Inválida","legal_accepted":true,"legal_terms_version":"2026-01-01","legal_privacy_version":"2026-01-01","legal_acceptance_source":"company_signup"}',
    'authenticated', 'authenticated', '', now()
  );

SELECT is(
  (SELECT count(*)::integer FROM public.legal_acceptances
    WHERE user_id = '19600000-0000-0000-0000-000000000001'),
  2,
  'company signup records both current legal documents'
);
SELECT is(
  (SELECT count(*)::integer FROM public.legal_acceptances
    WHERE user_id = '19600000-0000-0000-0000-000000000002'
      AND acceptance_source = 'invitation'),
  2,
  'invitation signup is recorded separately'
);
SELECT is(
  (SELECT count(*)::integer FROM public.legal_acceptances
    WHERE user_id IN (
      '19600000-0000-0000-0000-000000000003',
      '19600000-0000-0000-0000-000000000004'
    )),
  0,
  'missing or unknown document versions are not recorded'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '19600000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT count(*)::integer FROM public.legal_acceptances),
  2,
  'row security only reveals the signed-in user records'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
