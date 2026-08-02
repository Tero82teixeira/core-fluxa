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
      IF t='tasks' AND op='DELETE' THEN CONTINUE; END IF;
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

-- Re-declare every RPC consumed by the module so a fresh environment receives the
-- complete, reviewed contract even when older migrations were partially applied.
CREATE OR REPLACE FUNCTION public.invitation_preview(_token text)
RETURNS TABLE(organization_name text, email text, role public.app_role, status text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash text;
BEGIN
  IF _token IS NULL OR length(_token) < 32 THEN RETURN; END IF;
  v_hash := encode(extensions.digest(_token, 'sha256'), 'hex');
  RETURN QUERY SELECT COALESCE(o.trade_name,o.legal_name), i.email, i.role,
    CASE WHEN i.status='pending' AND i.expires_at<=now() THEN 'expired' ELSE i.status END, i.expires_at
  FROM public.organization_invitations i JOIN public.organizations o ON o.id=i.organization_id
  WHERE i.token_hash=v_hash LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS TABLE(organization_id uuid, role public.app_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE v_hash text; v_inv public.organization_invitations%ROWTYPE; v_email text; v_name text; v_existing public.organization_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF _token IS NULL OR length(_token)<32 THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  v_hash:=encode(extensions.digest(_token,'sha256'),'hex');
  SELECT * INTO v_inv FROM public.organization_invitations WHERE token_hash=v_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  IF v_inv.status='cancelled' THEN RAISE EXCEPTION 'INVITE_CANCELLED'; END IF;
  IF v_inv.status<>'pending' THEN RAISE EXCEPTION 'INVITE_ALREADY_USED'; END IF;
  IF v_inv.expires_at<=now() THEN
    UPDATE public.organization_invitations SET status='expired',updated_at=now() WHERE id=v_inv.id AND status='pending';
    RAISE EXCEPTION 'INVITE_EXPIRED';
  END IF;
  SELECT lower(u.email), COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1)) INTO v_email,v_name FROM auth.users u WHERE u.id=auth.uid();
  IF v_email IS NULL OR v_email<>lower(v_inv.email) THEN RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH'; END IF;
  SELECT * INTO v_existing FROM public.organization_members WHERE organization_id=v_inv.organization_id AND user_id=auth.uid() FOR UPDATE;
  IF FOUND AND v_existing.is_active THEN RAISE EXCEPTION 'MEMBERSHIP_ALREADY_EXISTS'; END IF;
  INSERT INTO public.profiles AS p(id,full_name,email) VALUES(auth.uid(),v_name,v_email)
    ON CONFLICT(id) DO UPDATE SET full_name=COALESCE(p.full_name,excluded.full_name),email=COALESCE(p.email,excluded.email);
  INSERT INTO public.organization_members AS m(organization_id,user_id,role,is_active)
    VALUES(v_inv.organization_id,auth.uid(),v_inv.role,true)
    ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key
    DO UPDATE SET role=excluded.role,is_active=true,updated_at=now() WHERE NOT m.is_active;
  UPDATE public.organization_invitations SET status='accepted',accepted_at=now(),updated_at=now(),
    token_hash=encode(extensions.gen_random_bytes(32),'hex') WHERE id=v_inv.id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_ALREADY_USED'; END IF;
  INSERT INTO public.audit_logs(organization_id,actor_id,actor_name,action,entity,entity_id,metadata)
    VALUES(v_inv.organization_id,auth.uid(),v_name,'invite.accepted','member',auth.uid(),jsonb_build_object('role',v_inv.role));
  INSERT INTO public.notifications(organization_id,user_id,kind,title,body,dedupe_key)
    VALUES(v_inv.organization_id,v_inv.invited_by,'team','Convite aceito',v_name||' entrou para a equipe.','invite-accepted-'||v_inv.id::text)
    ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT v_inv.organization_id,v_inv.role;
END $$;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.change_member_role(_member uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m public.organization_members%ROWTYPE; v_owner boolean; v_old public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_m FROM public.organization_members WHERE id=_member FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF v_m.user_id=auth.uid() THEN RAISE EXCEPTION 'CANNOT_CHANGE_OWN_ROLE'; END IF;
  v_owner:=public.has_org_role(v_m.organization_id,ARRAY['proprietario']::public.app_role[]);
  IF NOT v_owner AND NOT public.has_org_role(v_m.organization_id,ARRAY['administrador']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF NOT v_owner AND (v_m.role='proprietario' OR _role IN ('proprietario','administrador')) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _role NOT IN ('proprietario','administrador','gestor','operacional','visualizador') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF v_m.role='proprietario' AND _role<>'proprietario' AND (SELECT count(*) FROM public.organization_members WHERE organization_id=v_m.organization_id AND role='proprietario' AND is_active)<=1 THEN RAISE EXCEPTION 'LAST_OWNER'; END IF;
  v_old:=v_m.role; UPDATE public.organization_members SET role=_role,updated_at=now() WHERE id=_member;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v_m.organization_id,auth.uid(),'member.role_changed','member',v_m.user_id,jsonb_build_object('from',v_old,'to',_role));
  INSERT INTO public.notifications(organization_id,user_id,kind,title,body,dedupe_key) VALUES(v_m.organization_id,v_m.user_id,'team','Função alterada','Sua função foi alterada para '||_role::text,'role-'||_member::text||'-'||extract(epoch from now())::bigint) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.set_member_active(_member uuid, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_m public.organization_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_m FROM public.organization_members WHERE id=_member FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF v_m.user_id=auth.uid() THEN RAISE EXCEPTION 'CANNOT_CHANGE_SELF'; END IF;
  IF NOT public.has_org_role(v_m.organization_id,ARRAY['proprietario','administrador']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_m.role='proprietario' AND NOT public.has_org_role(v_m.organization_id,ARRAY['proprietario']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF NOT _active AND v_m.role='proprietario' AND (SELECT count(*) FROM public.organization_members WHERE organization_id=v_m.organization_id AND role='proprietario' AND is_active)<=1 THEN RAISE EXCEPTION 'LAST_OWNER'; END IF;
  IF NOT _active AND (EXISTS(SELECT 1 FROM public.tasks WHERE organization_id=v_m.organization_id AND assignee_id=v_m.user_id AND archived_at IS NULL AND status NOT IN ('concluida','cancelada','arquivada')) OR EXISTS(SELECT 1 FROM public.processes WHERE organization_id=v_m.organization_id AND owner_id=v_m.user_id AND archived_at IS NULL) OR EXISTS(SELECT 1 FROM public.monitoring_items WHERE organization_id=v_m.organization_id AND responsible_user_id=v_m.user_id AND archived_at IS NULL)) THEN RAISE EXCEPTION 'MEMBER_HAS_RESPONSIBILITIES'; END IF;
  UPDATE public.organization_members SET is_active=_active,updated_at=now() WHERE id=_member;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v_m.organization_id,auth.uid(),CASE WHEN _active THEN 'member.reactivated' ELSE 'member.deactivated' END,'member',v_m.user_id,'{}');
  INSERT INTO public.notifications(organization_id,user_id,kind,title,body,dedupe_key) VALUES(v_m.organization_id,v_m.user_id,'team',CASE WHEN _active THEN 'Acesso reativado' ELSE 'Acesso desativado' END,CASE WHEN _active THEN 'Seu vínculo com a organização foi reativado.' ELSE 'Seu vínculo com a organização foi desativado.' END,'member-active-'||_member::text||'-'||_active::text||'-'||extract(epoch from now())::bigint) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.transfer_member_responsibilities(_org uuid,_from uuid,_to uuid)
RETURNS TABLE(tasks_moved integer,processes_moved integer,monitoring_moved integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t integer; p integer; m integer; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.has_org_role(_org,ARRAY['proprietario','administrador']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _from=_to THEN RAISE EXCEPTION 'SAME_MEMBER'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_from) THEN RAISE EXCEPTION 'SOURCE_NOT_MEMBER'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_to AND is_active) THEN RAISE EXCEPTION 'TARGET_NOT_MEMBER'; END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id=_to;
  WITH moved AS (UPDATE public.tasks SET assignee_id=_to,assignee_name=v_name,updated_at=now() WHERE organization_id=_org AND assignee_id=_from AND archived_at IS NULL AND status NOT IN ('concluida','cancelada','arquivada') RETURNING 1) SELECT count(*)::integer INTO t FROM moved;
  WITH moved AS (UPDATE public.processes SET owner_id=_to,owner_name=v_name,updated_at=now() WHERE organization_id=_org AND owner_id=_from AND archived_at IS NULL RETURNING 1) SELECT count(*)::integer INTO p FROM moved;
  WITH moved AS (UPDATE public.monitoring_items SET responsible_user_id=_to,responsible_name=v_name,updated_at=now() WHERE organization_id=_org AND responsible_user_id=_from AND archived_at IS NULL RETURNING 1) SELECT count(*)::integer INTO m FROM moved;
  -- documents has uploader/reviewer provenance, not a transferable responsible-user field.
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_org,auth.uid(),'member.responsibilities_transferred','member',_from,jsonb_build_object('to',_to,'tasks',t,'processes',p,'monitoring',m));
  INSERT INTO public.notifications(organization_id,user_id,kind,title,body,dedupe_key) VALUES(_org,_to,'team','Responsabilidades transferidas',format('%s tarefa(s), %s processo(s) e %s monitoramento(s) foram atribuídos a você.',t,p,m),'transfer-'||_from::text||'-'||_to::text||'-'||extract(epoch from now())::bigint) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT t,p,m;
END $$;

REVOKE ALL ON FUNCTION public.change_member_role(uuid,public.app_role), public.set_member_active(uuid,boolean), public.transfer_member_responsibilities(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid,public.app_role), public.set_member_active(uuid,boolean), public.transfer_member_responsibilities(uuid,uuid,uuid) TO authenticated;

-- Physical task deletion remains forbidden; archival is the only supported removal path.
DROP POLICY IF EXISTS tasks_viewer_delete ON public.tasks;
REVOKE DELETE ON public.tasks FROM authenticated;
