begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  'RLS is enabled on every public table'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member-a@example.test', ''),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member-b@example.test', '');
-- The production signup trigger bootstraps the demo organization. Remove only
-- that fixture membership so each test identity belongs to exactly one tenant.
delete from public.organization_members
where user_id in (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);
insert into public.organizations (id, legal_name) values
  ('a0000000-0000-4000-8000-000000000001', 'Organization A'),
  ('b0000000-0000-4000-8000-000000000002', 'Organization B');
insert into public.organization_members (organization_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'proprietario'),
  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'proprietario');
insert into public.clients (organization_id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'Client A'),
  ('b0000000-0000-4000-8000-000000000002', 'Client B');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.organizations), 1, 'member sees only own organization');
select is((select count(*)::integer from public.clients), 1, 'member sees only own clients');
select is((select name from public.clients), 'Client A', 'cross-organization client is invisible');
select lives_ok($$insert into public.clients (organization_id, name) values ('a0000000-0000-4000-8000-000000000001', 'Allowed')$$, 'member can insert in own organization');
select throws_ok($$insert into public.clients (organization_id, name) values ('b0000000-0000-4000-8000-000000000002', 'Denied')$$, '42501', null, 'member cannot insert in another organization');
select is((select count(*)::integer from public.organization_members), 1, 'membership rows are isolated by organization');
reset role;
set local role anon;
select is((select count(*)::integer from public.clients), 0, 'anonymous users cannot read clients');

select * from finish();
rollback;
