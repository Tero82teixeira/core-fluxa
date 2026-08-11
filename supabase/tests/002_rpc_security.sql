BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(10);

SELECT has_function('public', 'accept_invitation', ARRAY['text'], 'accept_invitation exists');
SELECT ok(has_function_privilege('authenticated', 'public.accept_invitation(text)', 'EXECUTE'), 'authenticated can accept invitations');
SELECT ok(NOT has_function_privilege('anon', 'public.accept_invitation(text)', 'EXECUTE'), 'anon cannot accept invitations');
SELECT ok(has_function_privilege('anon', 'public.invitation_preview(text)', 'EXECUTE'), 'anon can preview invitations');
SELECT ok(NOT has_function_privilege('anon', 'public.create_invitation(uuid,text,app_role)', 'EXECUTE'), 'anon cannot create invitations');
SELECT ok(has_function_privilege('authenticated', 'public.create_invitation(uuid,text,app_role)', 'EXECUTE'), 'authenticated can create invitations subject to RPC checks');
SELECT ok(NOT has_function_privilege('anon', 'public.create_automation_rule(uuid,text,text,text,jsonb,text,jsonb,boolean)', 'EXECUTE'), 'anon cannot create automations');
SELECT ok(has_function_privilege('authenticated', 'public.create_automation_rule(uuid,text,text,text,jsonb,text,jsonb,boolean)', 'EXECUTE'), 'authenticated can call automation RPC subject to membership checks');
SELECT ok(NOT has_function_privilege('anon', 'public.create_test_notification(uuid)', 'EXECUTE'), 'anon cannot call notification RPC');
SELECT ok(has_function_privilege('authenticated', 'public.create_test_notification(uuid)', 'EXECUTE'), 'authenticated can call notification RPC subject to membership checks');

SELECT * FROM finish();
ROLLBACK;
