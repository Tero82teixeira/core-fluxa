-- Central operacional: alertas são derivados; esta tabela guarda somente o acompanhamento humano.
CREATE TABLE public.monitoring_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('tarefa','processo','documento','comunicacao','financeiro','outro')),
  source_id uuid NOT NULL, alert_kind text NOT NULL,
  monitoring_status text NOT NULL DEFAULT 'novo' CHECK (monitoring_status IN ('novo','em_analise','acompanhado','resolvido','ignorado')),
  assigned_to uuid, priority_override text CHECK (priority_override IS NULL OR priority_override IN ('baixa','media','alta','critica')),
  notes text, resolved_at timestamptz, ignored_at timestamptz, created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_type, source_id, alert_kind)
);
CREATE INDEX monitoring_states_org_status_idx ON public.monitoring_states(organization_id, monitoring_status, updated_at DESC);
ALTER TABLE public.monitoring_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY monitoring_states_read_member ON public.monitoring_states FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
REVOKE ALL ON public.monitoring_states FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.monitoring_states FROM authenticated;
GRANT SELECT ON public.monitoring_states TO authenticated;

CREATE TABLE public.monitoring_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  monitoring_state_id uuid NOT NULL REFERENCES public.monitoring_states(id) ON DELETE RESTRICT,
  action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, note text, actor_id uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.monitoring_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY monitoring_state_history_read_member ON public.monitoring_state_history FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
REVOKE ALL ON public.monitoring_state_history FROM PUBLIC, anon;
GRANT SELECT ON public.monitoring_state_history TO authenticated;

CREATE OR REPLACE FUNCTION public.monitoring_assert_source(_org uuid, _type text, _id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.has_org_role(_org,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'MONITORING_PERMISSION_DENIED'; END IF;
 IF _type NOT IN ('tarefa','processo','documento','comunicacao','financeiro','outro') THEN RAISE EXCEPTION 'MONITORING_SOURCE_INVALID'; END IF;
 IF (_type='tarefa' AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=_id AND organization_id=_org))
 OR (_type='processo' AND NOT EXISTS(SELECT 1 FROM public.processes WHERE id=_id AND organization_id=_org))
 OR (_type='documento' AND NOT EXISTS(SELECT 1 FROM public.documents WHERE id=_id AND organization_id=_org))
 OR (_type='comunicacao' AND NOT EXISTS(SELECT 1 FROM public.communication_threads WHERE id=_id AND organization_id=_org))
 OR (_type='financeiro' AND NOT EXISTS(SELECT 1 FROM public.financial_transactions WHERE id=_id AND organization_id=_org))
 OR (_type='outro' AND NOT EXISTS(SELECT 1 FROM public.monitoring_items WHERE id=_id AND organization_id=_org)) THEN RAISE EXCEPTION 'MONITORING_SOURCE_ORG_MISMATCH'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_monitoring_state(_organization_id uuid,_source_type text,_source_id uuid,_alert_kind text,_priority_override text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; BEGIN
 PERFORM public.monitoring_assert_source(_organization_id,_source_type,_source_id);
 IF _priority_override IS NOT NULL AND _priority_override NOT IN ('baixa','media','alta','critica') THEN RAISE EXCEPTION 'MONITORING_PRIORITY_INVALID'; END IF;
 INSERT INTO public.monitoring_states(organization_id,source_type,source_id,alert_kind,priority_override) VALUES(_organization_id,_source_type,_source_id,_alert_kind,_priority_override)
 ON CONFLICT(organization_id,source_type,source_id,alert_kind) DO UPDATE SET priority_override=EXCLUDED.priority_override,updated_at=now() RETURNING id INTO v;
 INSERT INTO public.monitoring_state_history(organization_id,monitoring_state_id,action,details) VALUES(_organization_id,v,'prioridade_alterada',jsonb_build_object('priority',_priority_override));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'monitoring.priority.changed','monitoring_state',v,jsonb_build_object('source_type',_source_type,'source_id',_source_id)); RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.change_monitoring_status(_organization_id uuid,_source_type text,_source_id uuid,_alert_kind text,_status text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; old text; BEGIN
 PERFORM public.monitoring_assert_source(_organization_id,_source_type,_source_id); IF _status NOT IN ('novo','em_analise','acompanhado','resolvido','ignorado') THEN RAISE EXCEPTION 'MONITORING_STATUS_INVALID'; END IF;
 SELECT monitoring_status INTO old FROM public.monitoring_states WHERE organization_id=_organization_id AND source_type=_source_type AND source_id=_source_id AND alert_kind=_alert_kind;
 INSERT INTO public.monitoring_states(organization_id,source_type,source_id,alert_kind,monitoring_status,resolved_at,ignored_at) VALUES(_organization_id,_source_type,_source_id,_alert_kind,_status,CASE WHEN _status='resolvido' THEN now() END,CASE WHEN _status='ignorado' THEN now() END)
 ON CONFLICT(organization_id,source_type,source_id,alert_kind) DO UPDATE SET monitoring_status=_status,resolved_at=CASE WHEN _status='resolvido' THEN now() END,ignored_at=CASE WHEN _status='ignorado' THEN now() END,updated_at=now() RETURNING id INTO v;
 INSERT INTO public.monitoring_state_history(organization_id,monitoring_state_id,action,details) VALUES(_organization_id,v,CASE WHEN old IN ('resolvido','ignorado') AND _status='novo' THEN 'reaberto' ELSE _status END,jsonb_build_object('from',old,'to',_status));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),CASE WHEN old IN ('resolvido','ignorado') AND _status='novo' THEN 'monitoring.reopened' ELSE 'monitoring.status.changed' END,'monitoring_state',v,jsonb_build_object('from',old,'to',_status)); RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.assign_monitoring_item(_organization_id uuid,_source_type text,_source_id uuid,_alert_kind text,_assigned_to uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; BEGIN PERFORM public.monitoring_assert_source(_organization_id,_source_type,_source_id);
 IF _assigned_to IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=_assigned_to AND is_active) THEN RAISE EXCEPTION 'MONITORING_ASSIGNEE_ORG_MISMATCH'; END IF;
 INSERT INTO public.monitoring_states(organization_id,source_type,source_id,alert_kind,assigned_to) VALUES(_organization_id,_source_type,_source_id,_alert_kind,_assigned_to) ON CONFLICT(organization_id,source_type,source_id,alert_kind) DO UPDATE SET assigned_to=_assigned_to,updated_at=now() RETURNING id INTO v;
 INSERT INTO public.monitoring_state_history(organization_id,monitoring_state_id,action,details) VALUES(_organization_id,v,'responsavel_alterado',jsonb_build_object('assigned_to',_assigned_to)); INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'monitoring.assignee.changed','monitoring_state',v,jsonb_build_object('assigned_to',_assigned_to)); RETURN v; END $$;

CREATE OR REPLACE FUNCTION public.add_monitoring_note(_organization_id uuid,_source_type text,_source_id uuid,_alert_kind text,_note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v uuid; BEGIN PERFORM public.monitoring_assert_source(_organization_id,_source_type,_source_id); IF length(trim(COALESCE(_note,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'MONITORING_NOTE_INVALID'; END IF;
 INSERT INTO public.monitoring_states(organization_id,source_type,source_id,alert_kind,notes) VALUES(_organization_id,_source_type,_source_id,_alert_kind,trim(_note)) ON CONFLICT(organization_id,source_type,source_id,alert_kind) DO UPDATE SET notes=CASE WHEN monitoring_states.notes IS NULL THEN trim(_note) ELSE monitoring_states.notes||E'\n'||trim(_note) END,updated_at=now() RETURNING id INTO v;
 INSERT INTO public.monitoring_state_history(organization_id,monitoring_state_id,action,note) VALUES(_organization_id,v,'nota_adicionada',trim(_note)); INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id) VALUES(_organization_id,auth.uid(),'monitoring.note.added','monitoring_state',v); RETURN v; END $$;

REVOKE ALL ON FUNCTION public.monitoring_assert_source(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.upsert_monitoring_state(uuid,text,uuid,text,text),public.change_monitoring_status(uuid,text,uuid,text,text),public.assign_monitoring_item(uuid,text,uuid,text,uuid),public.add_monitoring_note(uuid,text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upsert_monitoring_state(uuid,text,uuid,text,text),public.change_monitoring_status(uuid,text,uuid,text,text),public.assign_monitoring_item(uuid,text,uuid,text,uuid),public.add_monitoring_note(uuid,text,uuid,text,text) TO authenticated;

CREATE VIEW public.operational_monitoring_alerts WITH (security_invoker=true) AS
WITH alerts AS (
 SELECT t.organization_id,'tarefa'::text source_type,t.id source_id,CASE WHEN t.due_at::date<current_date THEN 'tarefa_atrasada' WHEN t.due_at::date=current_date THEN 'tarefa_hoje' ELSE 'tarefa_proxima' END alert_kind,t.title,t.description,t.client_id,t.process_id,t.assignee_id responsible_id,t.assignee_name responsible_name,t.priority::text source_priority,t.due_at relevant_at,t.updated_at last_movement_at,(t.due_at::date-current_date)::int days_delta,t.status::text source_status,NULL::numeric amount FROM public.tasks t WHERE t.archived_at IS NULL AND t.deleted_at IS NULL AND t.completed_at IS NULL AND t.status NOT IN ('concluida','cancelada') AND t.due_at::date<=current_date+7
 UNION ALL SELECT p.organization_id,'processo',p.id,CASE WHEN p.due_date<current_date THEN 'processo_atrasado' WHEN p.due_date<=current_date+7 THEN 'processo_prazo_proximo' ELSE 'processo_sem_movimentacao' END,COALESCE(p.title,p.code),NULL,p.client_id,p.id,p.owner_id,p.owner_name,p.priority::text,p.due_date::timestamptz,p.last_movement_at,(p.due_date-current_date)::int,p.stage::text,NULL FROM public.processes p WHERE p.archived_at IS NULL AND (p.due_date<=current_date+7 OR p.last_movement_at<now()-interval '14 days')
 UNION ALL SELECT d.organization_id,'documento',d.id,CASE WHEN d.expiration_date<current_date THEN 'documento_vencido' ELSE 'documento_vencendo' END,d.title,d.description,d.client_id,d.process_id,NULL,d.uploaded_by_name,NULL,d.expiration_date::timestamptz,d.updated_at,(d.expiration_date-current_date)::int,d.status::text,NULL FROM public.documents d WHERE d.archived_at IS NULL AND d.expiration_date IS NOT NULL AND d.expiration_date<=current_date+30
 UNION ALL SELECT c.organization_id,'comunicacao',c.id,CASE WHEN c.follow_up_at<now() AND c.follow_up_at::date<current_date THEN 'retorno_atrasado' ELSE 'retorno_hoje' END,c.subject,NULL,c.client_id,c.process_id,c.assigned_to,NULL,c.priority::text,c.follow_up_at,c.updated_at,(c.follow_up_at::date-current_date)::int,c.status::text,NULL FROM public.communication_threads c WHERE c.archived_at IS NULL AND c.status NOT IN ('resolvida','arquivada') AND c.follow_up_at IS NOT NULL AND c.follow_up_at::date<=current_date
 UNION ALL SELECT f.organization_id,'financeiro',f.id,CASE WHEN f.due_date<current_date THEN 'financeiro_vencido' ELSE 'financeiro_proximo' END,f.description,f.notes,f.client_id,f.process_id,f.responsible_user_id,NULL,NULL,f.due_date::timestamptz,f.updated_at,(f.due_date-current_date)::int,f.status::text,GREATEST(f.amount-COALESCE((SELECT sum(fp.amount) FROM public.financial_transaction_payments fp WHERE fp.transaction_id=f.id AND fp.reversed_at IS NULL),0),0) FROM public.financial_transactions f WHERE f.archived_at IS NULL AND f.status IN ('pending','partial','overdue') AND f.due_date<=current_date+7
), enriched AS (SELECT a.*,c.name client_name,p.code process_code,CASE WHEN a.days_delta<=-7 OR a.source_priority IN ('urgente','critica') OR a.amount>=50000 THEN 'critica' WHEN a.days_delta<0 OR a.source_priority='alta' OR a.amount>=10000 THEN 'alta' WHEN a.days_delta<=7 THEN 'media' ELSE 'baixa' END suggested_priority FROM alerts a LEFT JOIN public.clients c ON c.id=a.client_id AND c.organization_id=a.organization_id LEFT JOIN public.processes p ON p.id=a.process_id AND p.organization_id=a.organization_id)
SELECT e.organization_id,e.source_type,e.source_id,e.alert_kind,e.title,e.description,e.client_id,e.client_name,e.process_id,e.process_code,e.responsible_id,e.responsible_name,e.source_priority,e.suggested_priority,e.relevant_at,e.last_movement_at,e.days_delta,
 CASE WHEN e.alert_kind='processo_sem_movimentacao' THEN 'Processo sem movimentação há '||abs(extract(day from now()-e.last_movement_at))::int||' dias' WHEN e.days_delta<0 THEN e.title||' em atraso há '||abs(e.days_delta)||' dias' WHEN e.days_delta=0 THEN e.title||' vence hoje' ELSE e.title||' vence em '||e.days_delta||' dias' END reason,e.source_status,
 COALESCE(s.monitoring_status,'novo') monitoring_status,s.assigned_to,pr.full_name assigned_name,s.priority_override,s.notes,s.updated_at state_updated_at
FROM enriched e LEFT JOIN public.monitoring_states s ON s.organization_id=e.organization_id AND s.source_type=e.source_type AND s.source_id=e.source_id AND s.alert_kind=e.alert_kind LEFT JOIN public.profiles pr ON pr.id=s.assigned_to;
REVOKE ALL ON public.operational_monitoring_alerts FROM PUBLIC,anon; GRANT SELECT ON public.operational_monitoring_alerts TO authenticated;
