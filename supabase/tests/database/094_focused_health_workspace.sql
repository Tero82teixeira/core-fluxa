BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,encrypted_password,email_confirmed_at)
VALUES ('1e940000-0000-0000-0000-000000000001','health-focus@fluxa.test','{}','authenticated','authenticated','',now());
INSERT INTO public.profiles(id,full_name,email) VALUES
('1e940000-0000-0000-0000-000000000001','Responsável Teste','health-focus@fluxa.test')
ON CONFLICT (id) DO UPDATE SET full_name=excluded.full_name, email=excluded.email;

INSERT INTO public.organizations(id,legal_name,created_by,onboarding_completed,onboarding_completed_at)
VALUES
('2e940000-0000-0000-0000-000000000001','Clínica Existente','1e940000-0000-0000-0000-000000000001',true,now()),
('2e940000-0000-0000-0000-000000000002','Clínica Nova','1e940000-0000-0000-0000-000000000001',false,null);
INSERT INTO public.organization_members(organization_id,user_id,role,is_active)
VALUES
('2e940000-0000-0000-0000-000000000001','1e940000-0000-0000-0000-000000000001','proprietario',true),
('2e940000-0000-0000-0000-000000000002','1e940000-0000-0000-0000-000000000001','proprietario',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1e940000-0000-0000-0000-000000000001',true);
SELECT lives_ok(
  $$SELECT public.update_organization_segment(
    '2e940000-0000-0000-0000-000000000001','health',
    '["health_patients","health_appointments"]'::jsonb,'clinic_office')$$,
  'existing clinic can save the health segment'
);
SELECT lives_ok(
  $$SELECT public.update_organization_segment(
    '2e940000-0000-0000-0000-000000000002','health',
    '["health_patients","health_appointments"]'::jsonb,'clinic_office')$$,
  'new clinic can select the health segment'
);
RESET ROLE;

SELECT is(
  (SELECT focused_health_workspace FROM public.organization_settings
   WHERE organization_id='2e940000-0000-0000-0000-000000000001'),
  false, 'existing clinic keeps its current navigation'
);
SELECT is(
  (SELECT focused_health_workspace FROM public.organization_settings
   WHERE organization_id='2e940000-0000-0000-0000-000000000002'),
  true, 'new clinic receives the focused workspace'
);

UPDATE public.organizations SET onboarding_completed=true, onboarding_completed_at=now()
WHERE id='2e940000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','1e940000-0000-0000-0000-000000000001',true);
SELECT lives_ok(
  $$SELECT public.update_organization_segment(
    '2e940000-0000-0000-0000-000000000002','health',
    '["health_patients","health_appointments","health_billing"]'::jsonb,'clinic_office')$$,
  'new clinic can update modules after onboarding'
);
RESET ROLE;
SELECT is(
  (SELECT focused_health_workspace FROM public.organization_settings
   WHERE organization_id='2e940000-0000-0000-0000-000000000002'),
  true, 'focused workspace remains after finishing onboarding'
);

SELECT * FROM finish();
ROLLBACK;
