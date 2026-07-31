ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_onboarding_step_range;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_onboarding_step_range
  CHECK (onboarding_step BETWEEN 0 AND 3);

REVOKE ALL ON public.profiles, public.organizations, public.organization_members, public.organization_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_settings TO authenticated;
GRANT ALL ON public.profiles, public.organizations, public.organization_members, public.organization_settings TO service_role;

DROP POLICY IF EXISTS orgs_insert_authenticated ON public.organizations;

DROP POLICY IF EXISTS settings_write ON public.organization_settings;
CREATE POLICY settings_insert_admin ON public.organization_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]));

DROP FUNCTION IF EXISTS public.bootstrap_organization();
CREATE FUNCTION public.bootstrap_organization()
RETURNS TABLE (
  profile_id uuid,
  organization_id uuid,
  membership_id uuid,
  role public.app_role,
  is_active boolean,
  onboarding_completed_at timestamptz,
  onboarding_step integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  auth_user record;
  current_membership public.organization_members%ROWTYPE;
  current_organization public.organizations%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(caller_id::text, 0));

  SELECT id, email, raw_user_meta_data
    INTO auth_user
    FROM auth.users
   WHERE id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    caller_id,
    COALESCE(NULLIF(auth_user.raw_user_meta_data->>'full_name', ''), split_part(auth_user.email, '@', 1)),
    auth_user.email
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email = COALESCE(public.profiles.email, EXCLUDED.email);

  SELECT m.*
    INTO current_membership
    FROM public.organization_members AS m
   WHERE m.user_id = caller_id
   ORDER BY m.is_active DESC, m.created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF current_membership.id IS NULL THEN
    INSERT INTO public.organizations (legal_name)
    VALUES (COALESCE(NULLIF(auth_user.raw_user_meta_data->>'full_name', ''), split_part(auth_user.email, '@', 1)))
    RETURNING * INTO current_organization;

    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (current_organization.id, caller_id, 'proprietario', true)
    ON CONFLICT (organization_id, user_id) DO UPDATE
      SET is_active = true
    RETURNING * INTO current_membership;
  ELSE
    SELECT o.*
      INTO current_organization
      FROM public.organizations AS o
     WHERE o.id = current_membership.organization_id
     FOR UPDATE;

    IF current_organization.id IS NULL THEN
      RAISE EXCEPTION 'A organização do vínculo não foi encontrada.' USING ERRCODE = '23503';
    END IF;

    IF NOT current_membership.is_active AND current_membership.role = 'proprietario' THEN
      UPDATE public.organization_members
         SET is_active = true
       WHERE id = current_membership.id
       RETURNING * INTO current_membership;
    END IF;
  END IF;

  INSERT INTO public.organization_settings (organization_id)
  VALUES (current_membership.organization_id)
  ON CONFLICT (organization_id) DO NOTHING;

  IF current_organization.id IS NULL THEN
    SELECT o.* INTO current_organization
      FROM public.organizations AS o
     WHERE o.id = current_membership.organization_id;
  END IF;

  RETURN QUERY SELECT
    caller_id,
    current_membership.organization_id,
    current_membership.id,
    current_membership.role,
    current_membership.is_active,
    current_organization.onboarding_completed_at,
    current_organization.onboarding_step;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_organization() TO authenticated;