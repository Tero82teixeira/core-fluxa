ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS organization_members_user_active_idx
  ON public.organization_members (user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS organizations_created_by_idx
  ON public.organizations (created_by);

DROP FUNCTION IF EXISTS public.bootstrap_organization();

CREATE FUNCTION public.bootstrap_organization()
RETURNS TABLE(
  profile_id uuid,
  organization_id uuid,
  membership_id uuid,
  role app_role,
  is_active boolean,
  membership_status text,
  onboarding_completed_at timestamp with time zone,
  onboarding_step integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_caller uuid := auth.uid();
  v_user record;
  v_membership public.organization_members%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_NO_SESSION' USING ERRCODE = '28000';
  END IF;

  -- Impede dois bootstraps simultâneos para o mesmo usuário.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_caller::text, 0));

  SELECT u.id, u.email, u.raw_user_meta_data INTO v_user FROM auth.users u WHERE u.id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOTSTRAP_NO_SESSION' USING ERRCODE = '28000';
  END IF;

  -- 1. Perfil (reaproveita o existente).
  INSERT INTO public.profiles AS p (id, full_name, email)
  VALUES (
    v_caller,
    COALESCE(NULLIF(v_user.raw_user_meta_data->>'full_name', ''), split_part(v_user.email, '@', 1)),
    v_user.email
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(p.full_name, EXCLUDED.full_name),
        email = COALESCE(p.email, EXCLUDED.email)
  RETURNING p.* INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Vínculo existente (ativo tem prioridade; o mais antigo em seguida).
  SELECT m.* INTO v_membership
    FROM public.organization_members m
   WHERE m.user_id = v_caller
   ORDER BY m.is_active DESC, m.created_at ASC
   LIMIT 1
   FOR UPDATE;

  -- 3. Sem vínculo: reaproveita empresa criada pelo próprio usuário antes de criar outra.
  IF v_membership.id IS NULL THEN
    SELECT o.* INTO v_org
      FROM public.organizations o
     WHERE o.created_by = v_caller AND o.archived_at IS NULL
     ORDER BY o.created_at ASC
     LIMIT 1
     FOR UPDATE;

    IF v_org.id IS NULL THEN
      INSERT INTO public.organizations (legal_name, created_by)
      VALUES (
        COALESCE(NULLIF(v_user.raw_user_meta_data->>'full_name', ''), split_part(v_user.email, '@', 1)),
        v_caller
      )
      RETURNING * INTO v_org;
    END IF;

    INSERT INTO public.organization_members AS m (organization_id, user_id, role, is_active)
    VALUES (v_org.id, v_caller, 'proprietario', true)
    ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key DO UPDATE
      SET is_active = true
    RETURNING m.* INTO v_membership;
  ELSE
    SELECT o.* INTO v_org FROM public.organizations o WHERE o.id = v_membership.organization_id FOR UPDATE;
    IF v_org.id IS NULL THEN
      RAISE EXCEPTION 'BOOTSTRAP_ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Reativa apenas o criador da empresa; nunca promove usuários secundários.
    IF NOT v_membership.is_active AND (v_membership.role = 'proprietario' OR v_org.created_by = v_caller) THEN
      UPDATE public.organization_members m
         SET is_active = true,
             role = CASE WHEN v_org.created_by = v_caller THEN 'proprietario'::app_role ELSE m.role END
       WHERE m.id = v_membership.id
       RETURNING m.* INTO v_membership;
    END IF;

    IF v_org.created_by IS NULL AND v_membership.role = 'proprietario' THEN
      UPDATE public.organizations o SET created_by = v_caller WHERE o.id = v_org.id RETURNING o.* INTO v_org;
    END IF;
  END IF;

  IF v_membership.id IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_membership.is_active THEN
    RAISE EXCEPTION 'BOOTSTRAP_MEMBERSHIP_INACTIVE' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.organization_settings (organization_id)
  VALUES (v_org.id)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN QUERY SELECT
    v_profile.id,
    v_org.id,
    v_membership.id,
    v_membership.role,
    v_membership.is_active,
    CASE WHEN v_membership.is_active THEN 'active' ELSE 'inactive' END::text,
    v_org.onboarding_completed_at,
    v_org.onboarding_step;
END;
$function$;

REVOKE ALL ON FUNCTION public.bootstrap_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_organization() TO authenticated;