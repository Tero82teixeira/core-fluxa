BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

SELECT has_function('public', 'is_org_member', ARRAY['uuid'], 'is_org_member(uuid) exists');
SELECT has_function('public', 'has_org_role', ARRAY['uuid', 'app_role[]'], 'has_org_role(uuid, app_role[]) exists');
SELECT has_function('public', 'automation_conditions_match', ARRAY['jsonb', 'jsonb'], 'automation_conditions_match(jsonb, jsonb) exists');
SELECT has_function('public', 'accept_invitation', ARRAY['text'], 'accept_invitation(text) exists');
SELECT is(pg_get_function_result('public.accept_invitation(text)'::regprocedure), 'TABLE(organization_id uuid, membership_id uuid, role app_role, organization_name text)', 'accept_invitation has the corrected return type');
SELECT ok(NOT has_function_privilege('anon', 'public.accept_invitation(text)', 'EXECUTE'), 'anon cannot execute accept_invitation');
SELECT ok(has_function_privilege('authenticated', 'public.accept_invitation(text)', 'EXECUTE'), 'authenticated can execute accept_invitation');
SELECT ok(public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"}]', '{"status":"open"}'), 'automation condition equals succeeds');
SELECT ok(NOT public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"}]', '{"status":"closed"}'), 'automation condition equals fails closed');
SELECT ok(NOT public.automation_conditions_match('[{"field":"status","operator":"unknown","value":"open"}]', '{"status":"open"}'), 'unknown automation operator fails closed');

SELECT * FROM finish();
ROLLBACK;
