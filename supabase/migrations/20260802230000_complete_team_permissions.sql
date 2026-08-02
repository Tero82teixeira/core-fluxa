-- Team/permissions hardening. Extends the existing schema; no duplicate identity tables.
CREATE OR REPLACE FUNCTION public.create_invitation(_org uuid, _email text, _role public.app_role)
RETURNS TABLE(invitation_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_token text; v_hash text; v_email text := lower(trim(_email)); v_id uuid; v_exp timestamptz := now() + interval '7 days'; v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=auth.uid() AND is_active AND role IN ('proprietario','administrador')) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _role NOT IN ('administrador','gestor','operacional','visualizador') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF _role='administrador' AND NOT public.has_org_role(_org, ARRAY['proprietario']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.organization_id=_org AND lower(p.email)=v_email) THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
  UPDATE public.organization_invitations SET status='expired', updated_at=now() WHERE organization_id=_org AND status='pending' AND expires_at<now();
  SELECT full_name INTO v_actor FROM public.profiles WHERE id=auth.uid();
  v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  INSERT INTO public.organization_invitations AS i (organization_id,email,role,token_hash,invited_by,invited_by_name,expires_at)
  VALUES (_org,v_email,_role,v_hash,auth.uid(),v_actor,v_exp)
  ON CONFLICT (organization_id,lower(email)) WHERE status='pending' DO UPDATE SET role=excluded.role,token_hash=excluded.token_hash,invited_by=excluded.invited_by,invited_by_name=excluded.invited_by_name,expires_at=excluded.expires_at,updated_at=now()
  RETURNING i.id INTO v_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,actor_name,action,entity,entity_id,metadata) VALUES(_org,auth.uid(),v_actor,'invite.created','invitation',v_id,jsonb_build_object('email',v_email,'role',_role));
  RETURN QUERY SELECT v_id,v_token,v_exp;
END $$;
REVOKE ALL ON FUNCTION public.create_invitation(uuid,text,public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid,text,public.app_role) TO authenticated;

-- Membership rows are readable only inside an active membership. Mutations go through guarded RPCs.
DROP POLICY IF EXISTS members_select_org ON public.organization_members;
CREATE POLICY members_select_org ON public.organization_members FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM authenticated;

-- Prevent viewer writes on core operational resources while retaining SELECT policies.
DO $$ DECLARE t text; op text; BEGIN
  FOREACH t IN ARRAY ARRAY['clients','processes','documents','monitoring_items','tasks'] LOOP
    FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_viewer_'||lower(op),t);
      IF op='INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY[''proprietario'',''administrador'',''gestor'',''operacional'']::public.app_role[]))',t||'_viewer_'||lower(op),t);
      ELSIF op='UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY[''proprietario'',''administrador'',''gestor'',''operacional'']::public.app_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY[''proprietario'',''administrador'',''gestor'',''operacional'']::public.app_role[]))',t||'_viewer_'||lower(op),t);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY[''proprietario'',''administrador'',''gestor'',''operacional'']::public.app_role[]))',t||'_viewer_'||lower(op),t);
      END IF;
    END LOOP;
  END LOOP;
END $$;
