begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and coalesce(array_to_string(p.proconfig, ','), '') !~ 'search_path='
  ),
  'all SECURITY DEFINER RPCs pin search_path'
);
select has_function('public', 'is_org_member', array['uuid'], 'membership helper exists');
select has_function('public', 'automation_conditions_match', array['jsonb','jsonb'], 'automation matcher exists');

set local role anon;
select is(public.is_org_member('a0000000-0000-4000-8000-000000000001'), false, 'anonymous caller is not a member');
select throws_ok(
  $$select public.create_automation_rule('a0000000-0000-4000-8000-000000000001','x',null,'task.created','{}','notify','{}',true)$$,
  'P0001', 'NOT_ALLOWED', 'automation mutation rejects anonymous caller'
);
select throws_ok(
  $$select public.update_organization_settings('a0000000-0000-4000-8000-000000000001','{}'::jsonb)$$,
  '42501', null, 'organization settings mutation rejects anonymous caller'
);
reset role;

select * from finish();
rollback;
