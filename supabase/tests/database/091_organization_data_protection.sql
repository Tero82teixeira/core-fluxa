BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated','public.audit_logs','INSERT')
  AND NOT has_table_privilege('authenticated','public.audit_logs','UPDATE')
  AND NOT has_table_privilege('authenticated','public.audit_logs','DELETE'),
  'audit history remains append-only for browser sessions'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.record_audit_event(uuid,text,text,uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated operations keep the hardened audit entry point'
);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at) VALUES
('1e910000-0000-0000-0000-000000000001','backup-owner@fluxa.test','{}','authenticated','authenticated','',now()),
('1e910000-0000-0000-0000-000000000002','backup-viewer@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.profiles(id,full_name,email) VALUES
('1e910000-0000-0000-0000-000000000001','Proprietário Backup','backup-owner@fluxa.test'),
('1e910000-0000-0000-0000-000000000002','Visualizador Backup','backup-viewer@fluxa.test')
ON CONFLICT (id) DO UPDATE SET full_name=excluded.full_name;
INSERT INTO public.organizations(id,legal_name,created_by,commercial_status) VALUES
('2e910000-0000-0000-0000-000000000001','Empresa Protegida Ltda','1e910000-0000-0000-0000-000000000001','active');
INSERT INTO public.organization_members(organization_id,user_id,role,is_active) VALUES
('2e910000-0000-0000-0000-000000000001','1e910000-0000-0000-0000-000000000001','proprietario',true),
('2e910000-0000-0000-0000-000000000001','1e910000-0000-0000-0000-000000000002','visualizador',true);
INSERT INTO public.audit_logs(organization_id,actor_id,actor_name,action,entity,entity_id,metadata) VALUES
('2e910000-0000-0000-0000-000000000001','1e910000-0000-0000-0000-000000000001','Proprietário Backup','organization.backup.exported','organization','2e910000-0000-0000-0000-000000000001','{"record_count": 10}'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1e910000-0000-0000-0000-000000000001',true);
SELECT is(
  (SELECT count(*) FROM public.audit_logs WHERE organization_id='2e910000-0000-0000-0000-000000000001'),
  1::bigint,
  'owner can read the complete organization audit trail'
);

SELECT set_config('request.jwt.claim.sub','1e910000-0000-0000-0000-000000000002',true);
SELECT is(
  (SELECT count(*) FROM public.audit_logs WHERE organization_id='2e910000-0000-0000-0000-000000000001'),
  0::bigint,
  'viewer cannot read the complete organization audit trail'
);
SELECT lives_ok(
  $$SELECT public.record_audit_event(
    '2e910000-0000-0000-0000-000000000001',
    'document.downloaded',
    'document',
    NULL,
    '{}'::jsonb
  )$$,
  'viewer operations may still append identity-derived audit events'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
