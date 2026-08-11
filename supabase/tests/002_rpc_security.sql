begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function('public', 'accept_invitation', array['text'], 'accept_invitation exists');
select function_privs_are('public', 'accept_invitation', array['text'], 'authenticated', array['EXECUTE'], 'authenticated may execute accept_invitation');
select function_privs_are('public', 'accept_invitation', array['text'], 'anon', array[]::text[], 'anon is blocked from accept_invitation');
select has_function('public', 'automation_conditions_match', array['jsonb','jsonb'], 'automation_conditions_match exists');
select ok(public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"}]', '{"status":"open"}'), 'automation equals condition matches');
select isnt(public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"}]', '{"status":"closed"}'), true, 'automation equals condition rejects mismatch');
select ok(public.automation_conditions_match('[{"field":"name","operator":"contains","value":"flux"}]', '{"name":"FLUXA"}'), 'automation contains condition matches case-insensitively');
select has_table('public', 'communication_threads', 'communication threads table exists');
select has_table('public', 'communication_entries', 'communication entries table exists');
select policies_are('public', 'communication_threads', array['communication_threads_select'], 'communication thread policy is not duplicated');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000099', true);
select throws_ok($$select public.accept_invitation('short')$$, 'P0001', 'INVITE_NOT_FOUND', 'accept_invitation rejects an invalid token without hiding the error');
reset role;
set local role anon;
select throws_ok($$select public.accept_invitation(repeat('x', 32))$$, '42501', null, 'anon cannot invoke accept_invitation');

select * from finish();
rollback;
