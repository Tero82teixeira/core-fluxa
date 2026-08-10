CREATE TABLE public.support_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), created_by uuid NOT NULL REFERENCES public.profiles(id), assigned_to uuid REFERENCES public.profiles(id),
 subject text NOT NULL CHECK(length(trim(subject)) BETWEEN 3 AND 160), category text NOT NULL CHECK(length(trim(category)) BETWEEN 2 AND 80), description text NOT NULL CHECK(length(trim(description)) BETWEEN 10 AND 5000),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('baixa','normal','alta')), status text NOT NULL DEFAULT 'aberto' CHECK(status IN ('aberto','em_analise','aguardando_usuario','resolvido','arquivado')),
 related_module text, related_route text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, archived_at timestamptz
);
CREATE INDEX support_requests_org_updated_idx ON public.support_requests(organization_id,updated_at DESC);
CREATE INDEX support_requests_creator_idx ON public.support_requests(created_by,updated_at DESC);
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_requests_select ON public.support_requests FOR SELECT TO authenticated USING(created_by=auth.uid() OR public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]));
REVOKE ALL ON public.support_requests FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE ON public.support_requests FROM authenticated;
GRANT SELECT ON public.support_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.support_assert_admin(_org uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.has_org_role(_org,ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]) THEN RAISE EXCEPTION 'SUPPORT_ADMIN_PERMISSION_DENIED'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.create_support_request(_organization_id uuid,_subject text,_category text,_description text,_priority text DEFAULT 'normal',_related_module text DEFAULT NULL,_related_route text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id uuid; BEGIN
 IF auth.uid() IS NULL OR NOT public.is_org_member(_organization_id) THEN RAISE EXCEPTION 'SUPPORT_ORGANIZATION_ACCESS_DENIED'; END IF;
 IF _priority NOT IN ('baixa','normal','alta') THEN RAISE EXCEPTION 'SUPPORT_INVALID_PRIORITY'; END IF;
 INSERT INTO public.support_requests(organization_id,created_by,subject,category,description,priority,related_module,related_route) VALUES(_organization_id,auth.uid(),trim(_subject),trim(_category),trim(_description),_priority,nullif(trim(_related_module),''),nullif(trim(_related_route),'')) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'support.request.created','support_request',v_id,jsonb_build_object('category',_category,'priority',_priority,'related_module',_related_module)); RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.update_support_request_status(_request_id uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v public.support_requests%ROWTYPE; BEGIN
 SELECT * INTO v FROM public.support_requests WHERE id=_request_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND'; END IF; PERFORM public.support_assert_admin(v.organization_id);
 IF _status NOT IN ('aberto','em_analise','aguardando_usuario','resolvido') THEN RAISE EXCEPTION 'SUPPORT_INVALID_STATUS'; END IF;
 UPDATE public.support_requests SET status=_status,updated_at=now(),resolved_at=CASE WHEN _status='resolvido' THEN now() ELSE NULL END WHERE id=_request_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v.organization_id,auth.uid(),CASE WHEN _status='resolvido' THEN 'support.request.resolved' ELSE 'support.request.status_changed' END,'support_request',v.id,jsonb_build_object('from',v.status,'to',_status));
END $$;
CREATE OR REPLACE FUNCTION public.assign_support_request(_request_id uuid,_assigned_to uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v public.support_requests%ROWTYPE; BEGIN
 SELECT * INTO v FROM public.support_requests WHERE id=_request_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND'; END IF; PERFORM public.support_assert_admin(v.organization_id);
 IF _assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=v.organization_id AND user_id=_assigned_to AND is_active) THEN RAISE EXCEPTION 'SUPPORT_ASSIGNEE_ORG_MISMATCH'; END IF;
 UPDATE public.support_requests SET assigned_to=_assigned_to,updated_at=now() WHERE id=v.id; INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v.organization_id,auth.uid(),'support.request.assignee_changed','support_request',v.id,jsonb_build_object('assigned_to',_assigned_to));
END $$;
CREATE OR REPLACE FUNCTION public.archive_support_request(_request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v public.support_requests%ROWTYPE; BEGIN
 SELECT * INTO v FROM public.support_requests WHERE id=_request_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND'; END IF; PERFORM public.support_assert_admin(v.organization_id); UPDATE public.support_requests SET status='arquivado',archived_at=now(),updated_at=now() WHERE id=v.id; INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v.organization_id,auth.uid(),'support.request.archived','support_request',v.id,'{}');
END $$;
REVOKE ALL ON FUNCTION public.support_assert_admin(uuid),public.create_support_request(uuid,text,text,text,text,text,text),public.update_support_request_status(uuid,text),public.assign_support_request(uuid,uuid),public.archive_support_request(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_support_request(uuid,text,text,text,text,text,text),public.update_support_request_status(uuid,text),public.assign_support_request(uuid,uuid),public.archive_support_request(uuid) TO authenticated;
