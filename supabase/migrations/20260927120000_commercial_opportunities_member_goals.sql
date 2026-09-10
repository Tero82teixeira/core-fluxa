-- Real commercial opportunities and individual monthly goals. Browser writes are
-- restricted to audited RPCs; every row remains isolated by organization RLS.

CREATE TABLE public.commercial_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 180),
  stage text NOT NULL DEFAULT 'first_contact' CHECK (stage IN ('first_contact','qualification','proposal','negotiation','won','lost')),
  estimated_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_value BETWEEN 0 AND 999999999999.99),
  probability integer NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  owner_id uuid,
  next_action_at timestamptz,
  lost_reason text CHECK (lost_reason IS NULL OR length(btrim(lost_reason)) BETWEEN 3 AND 500),
  won_at timestamptz,
  lost_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK (stage <> 'lost' OR lost_reason IS NOT NULL)
);

CREATE INDEX commercial_opportunities_org_stage_idx ON public.commercial_opportunities(organization_id, stage) WHERE archived_at IS NULL;
CREATE INDEX commercial_opportunities_org_next_action_idx ON public.commercial_opportunities(organization_id, next_action_at) WHERE archived_at IS NULL AND next_action_at IS NOT NULL;

ALTER TABLE public.commercial_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_opportunities_select ON public.commercial_opportunities FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));
REVOKE ALL ON TABLE public.commercial_opportunities FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.commercial_opportunities FROM authenticated;
GRANT SELECT ON TABLE public.commercial_opportunities TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_commercial_opportunity(
  _organization_id uuid, _opportunity_id uuid, _title text, _stage text,
  _estimated_value numeric, _probability integer, _client_id uuid DEFAULT NULL,
  _owner_id uuid DEFAULT NULL, _next_action_at timestamptz DEFAULT NULL,
  _lost_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
DECLARE result_id uuid; old_stage text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF length(btrim(coalesce(_title,''))) NOT BETWEEN 3 AND 180 THEN RAISE EXCEPTION 'INVALID_TITLE'; END IF;
  IF _stage NOT IN ('first_contact','qualification','proposal','negotiation','won','lost') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF _estimated_value IS NULL OR _estimated_value NOT BETWEEN 0 AND 999999999999.99 OR _probability IS NULL OR _probability NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'INVALID_VALUE_OR_PROBABILITY'; END IF;
  IF _stage = 'lost' AND length(btrim(coalesce(_lost_reason,''))) < 3 THEN RAISE EXCEPTION 'LOST_REASON_REQUIRED'; END IF;
  IF _client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.organization_id=_organization_id AND c.archived_at IS NULL) THEN RAISE EXCEPTION 'CLIENT_SCOPE_MISMATCH'; END IF;
  IF _owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id=_organization_id AND m.user_id=_owner_id AND m.is_active) THEN RAISE EXCEPTION 'OWNER_SCOPE_MISMATCH'; END IF;

  IF _opportunity_id IS NULL THEN
    INSERT INTO public.commercial_opportunities(organization_id,client_id,title,stage,estimated_value,probability,owner_id,next_action_at,lost_reason,won_at,lost_at,created_by,updated_by)
    VALUES(_organization_id,_client_id,btrim(_title),_stage,_estimated_value,_probability,_owner_id,_next_action_at,nullif(btrim(coalesce(_lost_reason,'')),''),CASE WHEN _stage='won' THEN now() END,CASE WHEN _stage='lost' THEN now() END,auth.uid(),auth.uid()) RETURNING id INTO result_id;
  ELSE
    SELECT stage INTO old_stage FROM public.commercial_opportunities WHERE id=_opportunity_id AND organization_id=_organization_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OPPORTUNITY_NOT_FOUND'; END IF;
    UPDATE public.commercial_opportunities SET client_id=_client_id,title=btrim(_title),stage=_stage,estimated_value=_estimated_value,probability=_probability,owner_id=_owner_id,next_action_at=_next_action_at,lost_reason=CASE WHEN _stage='lost' THEN btrim(_lost_reason) END,won_at=CASE WHEN _stage='won' THEN coalesce(won_at,now()) END,lost_at=CASE WHEN _stage='lost' THEN coalesce(lost_at,now()) END,updated_by=auth.uid(),updated_at=now() WHERE id=_opportunity_id RETURNING id INTO result_id;
  END IF;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),CASE WHEN _opportunity_id IS NULL THEN 'commercial.opportunity.created' ELSE 'commercial.opportunity.updated' END,'commercial_opportunity',result_id,jsonb_build_object('stage',_stage,'previous_stage',old_stage,'estimated_value',_estimated_value));
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_commercial_opportunity(_organization_id uuid, _opportunity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador','gestor']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.commercial_opportunities SET archived_at=now(),updated_at=now(),updated_by=auth.uid() WHERE id=_opportunity_id AND organization_id=_organization_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'OPPORTUNITY_NOT_FOUND'; END IF;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id) VALUES(_organization_id,auth.uid(),'commercial.opportunity.archived','commercial_opportunity',_opportunity_id);
END;
$function$;

CREATE TABLE public.member_performance_goals (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  goal_month date NOT NULL CHECK (goal_month = date_trunc('month', goal_month)::date),
  completed_tasks_target integer NOT NULL DEFAULT 0 CHECK (completed_tasks_target BETWEEN 0 AND 100000),
  completed_processes_target integer NOT NULL DEFAULT 0 CHECK (completed_processes_target BETWEEN 0 AND 100000),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,user_id,goal_month)
);
ALTER TABLE public.member_performance_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_performance_goals_select ON public.member_performance_goals FOR SELECT TO authenticated USING(public.is_org_member(organization_id));
REVOKE ALL ON TABLE public.member_performance_goals FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.member_performance_goals FROM authenticated;
GRANT SELECT ON TABLE public.member_performance_goals TO authenticated;

CREATE OR REPLACE FUNCTION public.set_member_performance_goals(_organization_id uuid,_user_id uuid,_goal_month date,_completed_tasks_target integer,_completed_processes_target integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
DECLARE normalized_month date := date_trunc('month',_goal_month)::date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id,ARRAY['proprietario','administrador','gestor']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=_organization_id AND m.user_id=_user_id AND m.is_active) THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF _goal_month IS NULL OR _completed_tasks_target IS NULL OR _completed_processes_target IS NULL OR _completed_tasks_target NOT BETWEEN 0 AND 100000 OR _completed_processes_target NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'INVALID_GOAL_TARGET'; END IF;
  INSERT INTO public.member_performance_goals(organization_id,user_id,goal_month,completed_tasks_target,completed_processes_target,created_by,updated_by)
  VALUES(_organization_id,_user_id,normalized_month,_completed_tasks_target,_completed_processes_target,auth.uid(),auth.uid())
  ON CONFLICT(organization_id,user_id,goal_month) DO UPDATE SET completed_tasks_target=excluded.completed_tasks_target,completed_processes_target=excluded.completed_processes_target,updated_by=auth.uid(),updated_at=now();
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,metadata) VALUES(_organization_id,auth.uid(),'performance.member_goals.updated','member_performance_goals',jsonb_build_object('user_id',_user_id,'goal_month',normalized_month,'completed_tasks_target',_completed_tasks_target,'completed_processes_target',_completed_processes_target));
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_commercial_opportunity(uuid,uuid,text,text,numeric,integer,uuid,uuid,timestamptz,text), public.archive_commercial_opportunity(uuid,uuid), public.set_member_performance_goals(uuid,uuid,date,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_commercial_opportunity(uuid,uuid,text,text,numeric,integer,uuid,uuid,timestamptz,text), public.archive_commercial_opportunity(uuid,uuid), public.set_member_performance_goals(uuid,uuid,date,integer,integer) TO authenticated;
