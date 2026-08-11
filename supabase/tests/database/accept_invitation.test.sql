BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(14);

SELECT has_function('public', 'accept_invitation', ARRAY['text'], 'accept_invitation(text) exists');
SELECT is(
  pg_get_function_result('public.accept_invitation(text)'::regprocedure),
  'TABLE(organization_id uuid, membership_id uuid, role app_role, organization_name text)',
  'accept_invitation exposes the final return columns'
);
SELECT ok(NOT has_function_privilege('anon', 'public.accept_invitation(text)', 'EXECUTE'), 'anon cannot execute accept_invitation');
SELECT ok(has_function_privilege('authenticated', 'public.accept_invitation(text)', 'EXECUTE'), 'authenticated can execute accept_invitation');

INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role, encrypted_password, email_confirmed_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'member@fluxa.test', '{"full_name":"Member Test"}', 'authenticated', 'authenticated', '', now()),
  ('10000000-0000-0000-0000-000000000002', 'different@fluxa.test', '{}', 'authenticated', 'authenticated', '', now()),
  ('10000000-0000-0000-0000-000000000003', 'expired@fluxa.test', '{}', 'authenticated', 'authenticated', '', now());

INSERT INTO public.organizations (id, legal_name, trade_name)
VALUES ('20000000-0000-0000-0000-000000000001', 'Fluxa Invitation Test Ltda', 'Fluxa Invitation Test');

INSERT INTO public.organization_invitations (id, organization_id, email, role, status, token_hash, expires_at)
VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'member@fluxa.test', 'gestor', 'pending', encode(extensions.digest(repeat('v', 32), 'sha256'), 'hex'), now() + interval '1 day'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'invited@fluxa.test', 'operacional', 'pending', encode(extensions.digest(repeat('m', 32), 'sha256'), 'hex'), now() + interval '1 day'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'expired@fluxa.test', 'visualizador', 'pending', encode(extensions.digest(repeat('e', 32), 'sha256'), 'hex'), now() - interval '1 minute'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'member@fluxa.test', 'operacional', 'accepted', encode(extensions.digest(repeat('u', 32), 'sha256'), 'hex'), now() + interval '1 day');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

CREATE TEMP TABLE accepted_result AS
SELECT * FROM public.accept_invitation(repeat('v', 32));

SELECT is((SELECT organization_id FROM accepted_result), '20000000-0000-0000-0000-000000000001'::uuid, 'valid invitation is accepted into the invited organization');
SELECT ok((SELECT membership_id IS NOT NULL FROM accepted_result), 'acceptance returns the created membership');
SELECT is((SELECT role FROM accepted_result), 'gestor'::public.app_role, 'acceptance returns the invitation role');
SELECT ok(EXISTS (
  SELECT 1 FROM public.organization_members
  WHERE organization_id = '20000000-0000-0000-0000-000000000001' AND user_id = '10000000-0000-0000-0000-000000000001'
), 'membership is created in the invited organization');
SELECT is((
  SELECT role FROM public.organization_members
  WHERE organization_id = '20000000-0000-0000-0000-000000000001' AND user_id = '10000000-0000-0000-0000-000000000001'
), 'gestor'::public.app_role, 'membership preserves the invitation role');
SELECT ok((
  SELECT is_active FROM public.organization_members
  WHERE organization_id = '20000000-0000-0000-0000-000000000001' AND user_id = '10000000-0000-0000-0000-000000000001'
), 'membership in the accepted organization is active');

SELECT throws_ok(
  $$SELECT public.accept_invitation(repeat('v', 32))$$,
  'P0001', 'INVITE_NOT_FOUND', 'a second acceptance attempt is blocked after token invalidation'
);
SELECT throws_ok(
  $$SELECT public.accept_invitation(repeat('u', 32))$$,
  'P0001', 'INVITE_ALREADY_USED', 'an already used invitation is blocked'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  $$SELECT public.accept_invitation(repeat('m', 32))$$,
  'P0001', 'INVITE_EMAIL_MISMATCH', 'an invitation cannot be accepted by a different email'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
SELECT throws_ok(
  $$SELECT public.accept_invitation(repeat('e', 32))$$,
  'P0001', 'INVITE_EXPIRED', 'an expired invitation is blocked'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
