
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
    INSERT INTO public.organizations (legal_name)
    VALUES (COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)))
    RETURNING id INTO org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (org_id, uid, 'proprietario', true)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO public.organization_settings (organization_id) VALUES (org_id)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT m.* INTO mem FROM public.organization_members m
      WHERE m.user_id = uid AND m.organization_id = org_id LIMIT 1;
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
