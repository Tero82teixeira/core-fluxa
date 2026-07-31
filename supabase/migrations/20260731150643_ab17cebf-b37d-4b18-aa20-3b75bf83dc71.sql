-- 1) Restrict cross-member profile visibility to org leadership only
DROP POLICY IF EXISTS profiles_select_self_or_org ON public.profiles;

CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_select_org_admins ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = public.profiles.id
        AND m.is_active
        AND public.has_org_role(
          m.organization_id,
          ARRAY['proprietario','administrador','gestor']::app_role[]
        )
    )
  );

-- 2) Explicitly deny direct client writes on organization_counters
CREATE POLICY counters_no_insert ON public.organization_counters
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY counters_no_update ON public.organization_counters
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY counters_no_delete ON public.organization_counters
  FOR DELETE TO authenticated USING (false);

REVOKE INSERT, UPDATE, DELETE ON public.organization_counters FROM authenticated;
REVOKE ALL ON public.organization_counters FROM anon;

-- 3) Harden SECURITY DEFINER functions: no public/anon execute
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_process_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_organization() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- keep only what the app actually calls
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_process_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_organization() TO authenticated;

-- explicit caller validation inside the client-callable definer RPCs
CREATE OR REPLACE FUNCTION public.next_process_code(_org uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_org_member(_org) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização.';
  END IF;
  INSERT INTO public.organization_counters (organization_id, process_seq)
  VALUES (_org, 1)
  ON CONFLICT (organization_id)
  DO UPDATE SET process_seq = public.organization_counters.process_seq + 1, updated_at = now()
  RETURNING process_seq INTO n;
  RETURN 'FLX-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
END; $function$;