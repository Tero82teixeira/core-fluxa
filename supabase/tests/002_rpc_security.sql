begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Catalog assertions validate the installed schema, not migration source text.
select results_eq(
  $$select enumlabel::text from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='app_role' order by enumsortorder$$,
  $$values ('superadmin'),('proprietario'),('administrador'),('gestor'),('operacional'),('atendimento'),('financeiro'),('visualizador'),('cliente_externo')$$,
  'installed app_role enum contains all current roles in declared order'
);

with private(name) as (values
 ('get_organization_settings'),('update_organization_settings'),
 ('register_partial_payment'),('mark_financial_transaction_paid'),('reverse_financial_payment'),
 ('create_financial_recurrence'),('update_financial_recurrence'),('generate_recurrence_transactions'),
 ('create_communication_thread'),('add_communication_entry'),('change_communication_thread_status'),
 ('assign_communication_thread'),('update_communication_thread'),
 ('upsert_monitoring_state'),('change_monitoring_status'),('assign_monitoring_item'),('add_monitoring_note'),
 ('accept_invitation'),('create_support_request'),('update_support_request_status'),('assign_support_request'),('archive_support_request')
)
select ok(
  not has_function_privilege('anon',p.oid,'EXECUTE') and not exists (
    select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where acl.grantee=0 and acl.privilege_type='EXECUTE'
  ),
  p.proname||' denies PUBLIC/anon EXECUTE')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join private x on x.name=p.proname
where n.nspname='public';

-- preview_invitation is the single intentional public contract; acceptance still
-- authenticates and validates email, expiry and one-time use inside its body.
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='preview_invitation'),'preview_invitation public exception exists');

with critical(name) as (values
 ('get_organization_settings'),('update_organization_settings'),('register_partial_payment'),
 ('reverse_financial_payment'),('create_communication_thread'),('change_monitoring_status'),
 ('create_support_request'),('accept_invitation'))
select ok(p.prosecdef and coalesce(array_to_string(p.proconfig,','),'') ~ 'search_path=',p.proname||' is SECURITY DEFINER with fixed search_path')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join critical c on c.name=p.proname where n.nspname='public';

select * from finish();
rollback;
