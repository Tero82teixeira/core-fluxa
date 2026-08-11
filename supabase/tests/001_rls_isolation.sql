BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(12);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organizations'::regclass), 'organizations has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organization_members'::regclass), 'organization_members has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organizations'), 'organizations has policies');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_members'), 'organization_members has policies');
SELECT ok(NOT has_table_privilege('anon', 'public.organizations', 'INSERT'), 'anon cannot insert organizations');
SELECT ok(NOT has_table_privilege('anon', 'public.organization_members', 'INSERT'), 'anon cannot insert memberships');
SELECT ok(has_table_privilege('authenticated', 'public.organizations', 'SELECT'), 'authenticated receives table grant');
SELECT ok(has_table_privilege('authenticated', 'public.organization_members', 'SELECT'), 'authenticated receives membership grant');
SELECT ok(has_function_privilege('authenticated', 'public.is_org_member(uuid)', 'EXECUTE'), 'authenticated can evaluate membership');
SELECT ok(NOT has_function_privilege('anon', 'public.is_org_member(uuid)', 'EXECUTE'), 'anon cannot evaluate membership');
SELECT ok(pg_get_functiondef('public.is_org_member(uuid)'::regprocedure) ~ 'is_active', 'inactive memberships are excluded');

SELECT * FROM finish();
ROLLBACK;
