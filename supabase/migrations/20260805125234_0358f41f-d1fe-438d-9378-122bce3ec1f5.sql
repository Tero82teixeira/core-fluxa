CREATE OR REPLACE FUNCTION public.create_invitation(_org uuid, _email text, _role app_role)
 RETURNS TABLE(invitation_id uuid, token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE v_token text; v_hash text; v_email text := lower(trim(_email)); v_id uuid; v_exp timestamptz := now() + interval '7 days'; v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=auth.uid() AND is_active AND role IN ('proprietario','administrador')) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _role NOT IN ('administrador','gestor','operacional','visualizador') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF _role='administrador' AND NOT public.has_org_role(_org, ARRAY['proprietario']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.organization_id=_org AND lower(p.email)=v_email) THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
  UPDATE public.organization_invitations i SET status='expired', updated_at=now() WHERE i.organization_id=_org AND i.status='pending' AND i.expires_at<now();
  SELECT p.full_name INTO v_actor FROM public.profiles p WHERE p.id=auth.uid();
  v_token:=encode(extensions.gen_random_bytes(32),'hex'); v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  INSERT INTO public.organization_invitations AS i (organization_id,email,role,token_hash,invited_by,invited_by_name,expires_at)
  VALUES (_org,v_email,_role,v_hash,auth.uid(),v_actor,v_exp)
  ON CONFLICT (organization_id,lower(email)) WHERE status='pending' DO UPDATE SET role=excluded.role,token_hash=excluded.token_hash,invited_by=excluded.invited_by,invited_by_name=excluded.invited_by_name,expires_at=excluded.expires_at,updated_at=now()
  RETURNING i.id INTO v_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,actor_name,action,entity,entity_id,metadata) VALUES(_org,auth.uid(),v_actor,'invite.created','invitation',v_id,jsonb_build_object('email',v_email,'role',_role));
  RETURN QUERY SELECT v_id, v_token, v_exp;
END $function$;

REVOKE EXECUTE ON FUNCTION public.create_invitation(uuid, text, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, text, app_role) TO authenticated;