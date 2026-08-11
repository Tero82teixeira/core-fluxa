BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(12);

SELECT has_function('public', 'bootstrap_organization', ARRAY[]::text[], 'bootstrap RPC exists');
SELECT has_function('public', 'accept_invitation', ARRAY['text'], 'accept_invitation RPC exists');
SELECT has_function('public', 'create_communication_thread', 'communication creation RPC exists');
SELECT has_function('public', 'change_monitoring_status', 'monitoring status RPC exists');
SELECT ok(NOT has_function_privilege('anon', 'public.bootstrap_organization()', 'EXECUTE'), 'anon cannot bootstrap organizations');
SELECT ok(has_function_privilege('authenticated', 'public.bootstrap_organization()', 'EXECUTE'), 'authenticated can bootstrap organizations');
SELECT ok(NOT has_function_privilege('anon', 'public.accept_invitation(text)', 'EXECUTE'), 'anon cannot accept invitations');
SELECT ok(has_function_privilege('authenticated', 'public.accept_invitation(text)', 'EXECUTE'), 'authenticated can accept invitations');
SELECT ok(NOT has_function_privilege('anon', 'public.mark_notification_read(uuid)', 'EXECUTE'), 'anon cannot mutate notifications');
SELECT ok(has_function_privilege('authenticated', 'public.mark_notification_read(uuid)', 'EXECUTE'), 'authenticated can mutate notifications');
SELECT is((SELECT prosecdef FROM pg_proc WHERE oid = 'public.accept_invitation(text)'::regprocedure), true, 'accept_invitation is security definer');
SELECT is((SELECT proconfig @> ARRAY['search_path=public, extensions, auth'] FROM pg_proc WHERE oid = 'public.accept_invitation(text)'::regprocedure), true, 'accept_invitation pins its search_path');

SELECT * FROM finish();
ROLLBACK;
