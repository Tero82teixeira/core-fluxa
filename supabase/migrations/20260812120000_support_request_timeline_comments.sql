-- Evolui a Central de Ajuda sem expor escritas diretas nas tabelas de suporte.
CREATE TABLE public.support_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  request_id uuid NOT NULL REFERENCES public.support_requests(id),
  actor_user_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL CHECK (event_type IN ('created','status_changed','assigned','unassigned','comment_added','resolved','reopened','archived')),
  old_value jsonb,
  new_value jsonb,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  request_id uuid NOT NULL REFERENCES public.support_requests(id),
  author_user_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  archived_at timestamptz
);

CREATE INDEX support_request_events_request_created_idx ON public.support_request_events(request_id, created_at, id);
CREATE INDEX support_request_events_org_created_idx ON public.support_request_events(organization_id, created_at DESC);
CREATE INDEX support_request_comments_request_created_idx ON public.support_request_comments(request_id, created_at, id) WHERE archived_at IS NULL;
CREATE INDEX support_request_comments_org_created_idx ON public.support_request_comments(organization_id, created_at DESC);

ALTER TABLE public.support_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_request_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_request_events_select ON public.support_request_events FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) AND EXISTS (
  SELECT 1 FROM public.support_requests r WHERE r.id=request_id AND r.organization_id=organization_id
    AND (r.created_by=auth.uid() OR public.has_org_role(r.organization_id, ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]))
));
CREATE POLICY support_request_comments_select ON public.support_request_comments FOR SELECT TO authenticated
USING (public.is_org_member(organization_id) AND EXISTS (
  SELECT 1 FROM public.support_requests r WHERE r.id=request_id AND r.organization_id=organization_id
    AND (r.created_by=auth.uid() OR public.has_org_role(r.organization_id, ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]))
));

REVOKE ALL ON public.support_request_events, public.support_request_comments FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.support_request_events, public.support_request_comments FROM authenticated;
GRANT SELECT ON public.support_request_events, public.support_request_comments TO authenticated;

CREATE OR REPLACE FUNCTION public.create_support_request(_organization_id uuid,_subject text,_category text,_description text,_priority text DEFAULT 'normal',_related_module text DEFAULT NULL,_related_route text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_org_member(_organization_id) THEN RAISE EXCEPTION 'SUPPORT_ORGANIZATION_ACCESS_DENIED'; END IF;
 IF _priority NOT IN ('baixa','normal','alta') THEN RAISE EXCEPTION 'SUPPORT_INVALID_PRIORITY'; END IF;
 INSERT INTO public.support_requests(organization_id,created_by,subject,category,description,priority,related_module,related_route)
 VALUES(_organization_id,auth.uid(),trim(_subject),trim(_category),trim(_description),_priority,nullif(trim(_related_module),''),nullif(trim(_related_route),'')) RETURNING id INTO v_id;
 INSERT INTO public.support_request_events(organization_id,request_id,actor_user_id,event_type,new_value)
 VALUES(_organization_id,v_id,auth.uid(),'created',jsonb_build_object('status','aberto','priority',_priority));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
 VALUES(_organization_id,auth.uid(),'support.request.created','support_request',v_id,jsonb_build_object('category',_category,'priority',_priority,'related_module',_related_module));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_support_request_status(_request_id uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.support_requests%ROWTYPE; v_event text; v_action text;
BEGIN
 SELECT * INTO v FROM public.support_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND'; END IF;
 PERFORM public.support_assert_admin(v.organization_id);
 IF _status NOT IN ('aberto','em_analise','aguardando_usuario','resolvido') THEN RAISE EXCEPTION 'SUPPORT_INVALID_STATUS'; END IF;
 IF v.status=_status THEN RETURN; END IF;
 v_event:=CASE WHEN _status='resolvido' THEN 'resolved' WHEN v.status='resolvido' THEN 'reopened' ELSE 'status_changed' END;
 v_action:=CASE WHEN _status='resolvido' THEN 'support.request.resolved' WHEN v.status='resolvido' THEN 'support.request.reopened' ELSE 'support.request.status_changed' END;
 UPDATE public.support_requests SET status=_status,updated_at=now(),resolved_at=CASE WHEN _status='resolvido' THEN now() ELSE NULL END WHERE id=_request_id;
 INSERT INTO public.support_request_events(organization_id,request_id,actor_user_id,event_type,old_value,new_value)
 VALUES(v.organization_id,v.id,auth.uid(),v_event,jsonb_build_object('status',v.status),jsonb_build_object('status',_status));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
 VALUES(v.organization_id,auth.uid(),v_action,'support_request',v.id,jsonb_build_object('from',v.status,'to',_status));
 IF _status IN ('aguardando_usuario','resolvido') AND v.created_by<>auth.uid() THEN
   INSERT INTO public.notifications(organization_id,user_id,kind,title,body,entity_type,entity_id,action_url,dedupe_key)
   VALUES(v.organization_id,v.created_by,'support',CASE WHEN _status='resolvido' THEN 'Chamado resolvido' ELSE 'Chamado aguardando você' END,v.subject,'support_request',v.id,'/ajuda','support-status-'||v.id::text||'-'||_status||'-'||extract(epoch from now())::bigint);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assign_support_request(_request_id uuid,_assigned_to uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.support_requests%ROWTYPE; v_event text;
BEGIN
 SELECT * INTO v FROM public.support_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND'; END IF;
 PERFORM public.support_assert_admin(v.organization_id);
 IF _assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=v.organization_id AND user_id=_assigned_to AND is_active) THEN RAISE EXCEPTION 'SUPPORT_ASSIGNEE_ORG_MISMATCH'; END IF;
 IF v.assigned_to IS NOT DISTINCT FROM _assigned_to THEN RETURN; END IF;
 v_event:=CASE WHEN _assigned_to IS NULL THEN 'unassigned' ELSE 'assigned' END;
 UPDATE public.support_requests SET assigned_to=_assigned_to,updated_at=now() WHERE id=v.id;
 INSERT INTO public.support_request_events(organization_id,request_id,actor_user_id,event_type,old_value,new_value)
 VALUES(v.organization_id,v.id,auth.uid(),v_event,jsonb_build_object('assigned_to',v.assigned_to),jsonb_build_object('assigned_to',_assigned_to));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
 VALUES(v.organization_id,auth.uid(),'support.request.assignee_changed','support_request',v.id,jsonb_build_object('from',v.assigned_to,'to',_assigned_to));
 IF _assigned_to IS NOT NULL AND _assigned_to<>auth.uid() THEN
  INSERT INTO public.notifications(organization_id,user_id,kind,title,body,entity_type,entity_id,action_url,dedupe_key)
  VALUES(v.organization_id,_assigned_to,'support','Chamado atribuído a você',v.subject,'support_request',v.id,'/ajuda','support-assigned-'||v.id::text||'-'||_assigned_to::text||'-'||extract(epoch from now())::bigint);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.archive_support_request(_request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.support_requests%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.support_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND'; END IF;
 PERFORM public.support_assert_admin(v.organization_id);
 IF v.status='arquivado' THEN RETURN; END IF;
 UPDATE public.support_requests SET status='arquivado',archived_at=now(),updated_at=now() WHERE id=v.id;
 INSERT INTO public.support_request_events(organization_id,request_id,actor_user_id,event_type,old_value,new_value)
 VALUES(v.organization_id,v.id,auth.uid(),'archived',jsonb_build_object('status',v.status),jsonb_build_object('status','arquivado'));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
 VALUES(v.organization_id,auth.uid(),'support.request.archived','support_request',v.id,jsonb_build_object('from',v.status));
END $$;

CREATE OR REPLACE FUNCTION public.add_support_request_comment(_request_id uuid,_body text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.support_requests%ROWTYPE; v_id uuid; v_recipient uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SUPPORT_AUTH_REQUIRED'; END IF;
 SELECT * INTO v FROM public.support_requests WHERE id=_request_id;
 IF NOT FOUND OR NOT public.is_org_member(v.organization_id) OR NOT (v.created_by=auth.uid() OR public.has_org_role(v.organization_id,ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[])) THEN RAISE EXCEPTION 'SUPPORT_REQUEST_ACCESS_DENIED'; END IF;
 IF length(trim(coalesce(_body,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'SUPPORT_INVALID_COMMENT'; END IF;
 INSERT INTO public.support_request_comments(organization_id,request_id,author_user_id,body) VALUES(v.organization_id,v.id,auth.uid(),trim(_body)) RETURNING id INTO v_id;
 UPDATE public.support_requests SET updated_at=now() WHERE id=v.id;
 INSERT INTO public.support_request_events(organization_id,request_id,actor_user_id,event_type,new_value,message) VALUES(v.organization_id,v.id,auth.uid(),'comment_added',jsonb_build_object('comment_id',v_id),left(trim(_body),240));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v.organization_id,auth.uid(),'support.request.comment_added','support_request',v.id,jsonb_build_object('comment_id',v_id));
 v_recipient:=CASE WHEN auth.uid()=v.created_by THEN v.assigned_to ELSE v.created_by END;
 IF v_recipient IS NOT NULL AND v_recipient<>auth.uid() THEN
  INSERT INTO public.notifications(organization_id,user_id,kind,title,body,entity_type,entity_id,action_url,dedupe_key) VALUES(v.organization_id,v_recipient,'support','Novo comentário no chamado',v.subject,'support_request',v.id,'/ajuda','support-comment-'||v_id::text);
 END IF;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.add_support_request_comment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_support_request_comment(uuid,text) TO authenticated;
