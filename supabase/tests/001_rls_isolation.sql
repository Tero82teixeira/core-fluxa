begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.organizations (id, legal_name) values
  ('10000000-0000-0000-0000-000000000001', 'Integration Org A'),
  ('10000000-0000-0000-0000-000000000002', 'Integration Org B');
insert into public.organization_members (organization_id, user_id, role, is_active) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'administrador', true),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'administrador', true),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'operacional', false);
insert into public.clients (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Client A'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Client B');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.clients), 1, 'RLS exposes own organization client');
select is((select count(*)::integer from public.clients where organization_id='10000000-0000-0000-0000-000000000002'), 0, 'RLS blocks cross-organization client');
select ok(public.is_org_member('10000000-0000-0000-0000-000000000001'), 'active member is recognized');
select isnt(public.is_org_member('10000000-0000-0000-0000-000000000002'), true, 'member is not recognized in another organization');
select is((select count(*)::integer from public.organizations), 1, 'organization RLS is isolated');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select isnt(public.is_org_member('10000000-0000-0000-0000-000000000001'), true, 'inactive member is blocked by membership helper');
select is((select count(*)::integer from public.clients), 0, 'inactive member cannot read organization rows');

reset role;
set local role anon;
select throws_ok('select * from public.clients', '42501', null, 'anon has no direct clients access');
select throws_ok('insert into public.clients (organization_id,name) values (''10000000-0000-0000-0000-000000000001'',''Anon'')', '42501', null, 'anon cannot insert clients');

select * from finish();
rollback;
