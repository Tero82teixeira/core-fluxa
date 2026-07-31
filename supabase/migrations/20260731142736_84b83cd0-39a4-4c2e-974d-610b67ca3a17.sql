
-- 1) Data API grants (missing entirely -> permission denied for every table)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.organizations, public.organization_members,
  public.organization_settings, public.clients, public.client_contacts, public.client_addresses,
  public.processes, public.process_stages, public.process_movements, public.tasks,
  public.service_types, public.notifications, public.audit_logs, public.organization_counters TO authenticated;
GRANT SELECT ON public.permissions, public.role_permissions TO authenticated;
GRANT ALL ON public.profiles, public.organizations, public.organization_members, public.organization_settings,
  public.clients, public.client_contacts, public.client_addresses, public.processes, public.process_stages,
  public.process_movements, public.tasks, public.service_types, public.notifications, public.audit_logs,
  public.organization_counters, public.permissions, public.role_permissions TO service_role;

-- 2) Onboarding state in DB
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
UPDATE public.organizations SET onboarding_completed_at = now()
  WHERE onboarding_completed AND onboarding_completed_at IS NULL;

-- 3) Members: no self-elevation. Users may only insert their own membership through the RPC.
DROP POLICY IF EXISTS members_insert ON public.organization_members;
CREATE POLICY members_insert ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario'::app_role,'administrador'::app_role]));

-- 4) Idempotent bootstrap
CREATE OR REPLACE FUNCTION public.bootstrap_organization()
RETURNS TABLE (organization_id uuid, membership_id uuid, role app_role, onboarding_completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  u record;
  org_id uuid;
  mem record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '28000'; END IF;

  SELECT id, email, raw_user_meta_data INTO u FROM auth.users WHERE id = uid;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (uid, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)), u.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT m.* INTO mem FROM public.organization_members m
    WHERE m.user_id = uid AND m.is_active ORDER BY m.created_at LIMIT 1;

  IF mem.id IS NULL THEN
    INSERT INTO public.organizations (legal_name, trade_name)
    VALUES (COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@','1'::int)), NULL)
    RETURNING id INTO org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (org_id, uid, 'proprietario', true)
    ON CONFLICT (organization_id, user_id, role) DO NOTHING;

    INSERT INTO public.organization_settings (organization_id) VALUES (org_id)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT m.* INTO mem FROM public.organization_members m WHERE m.user_id = uid AND m.organization_id = org_id LIMIT 1;
  ELSE
    INSERT INTO public.organization_settings (organization_id) VALUES (mem.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT mem.organization_id, mem.id, mem.role, o.onboarding_completed_at
    FROM public.organizations o WHERE o.id = mem.organization_id;
END; $$;

REVOKE ALL ON FUNCTION public.bootstrap_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_organization() TO authenticated;
