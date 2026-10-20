-- Assessoria mensal: um plano por projeto, geração explícita de tarefas por competência.
CREATE TABLE IF NOT EXISTS public.consulting_monthly_plans (
  process_id uuid PRIMARY KEY REFERENCES public.processes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_name text NOT NULL CHECK (length(trim(service_name)) BETWEEN 3 AND 160),
  monthly_amount numeric(12,2) NOT NULL CHECK (monthly_amount >= 0),
  starts_on date NOT NULL CHECK (starts_on BETWEEN '2000-01-01' AND '2100-12-31'),
  ends_on date NOT NULL CHECK (ends_on BETWEEN starts_on AND '2100-12-31'),
  status text NOT NULL CHECK (status IN ('ativo','pausado','encerrado')),
  return_on date CHECK (return_on BETWEEN '2000-01-01' AND '2100-12-31'),
  routine jsonb NOT NULL CHECK (jsonb_typeof(routine)='array' AND jsonb_array_length(routine) BETWEEN 1 AND 20),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS consulting_plans_org_end_idx ON public.consulting_monthly_plans(organization_id,status,ends_on,process_id);
CREATE INDEX IF NOT EXISTS consulting_plans_org_return_idx ON public.consulting_monthly_plans(organization_id,return_on) WHERE status='ativo';
CREATE TABLE IF NOT EXISTS public.consulting_plan_months (
  process_id uuid NOT NULL REFERENCES public.consulting_monthly_plans(process_id) ON DELETE CASCADE,
  reference date NOT NULL CHECK (extract(day FROM reference)=1),
  task_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  PRIMARY KEY(process_id,reference)
);
ALTER TABLE public.consulting_monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulting_plan_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consulting_monthly_plans,public.consulting_plan_months FROM PUBLIC,anon,authenticated,service_role;

-- Helper interno: o mesmo papel da rotina de projetos e módulos da área.
CREATE OR REPLACE FUNCTION public.consulting_plan_access(_organization_id uuid,_write boolean DEFAULT false,_tasks boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_org_role(_organization_id,
   CASE WHEN _write THEN ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
   ELSE ARRAY['superadmin','proprietario','administrador','gestor','operacional','visualizador']::public.app_role[] END)
 AND EXISTS(SELECT 1 FROM public.organization_settings s WHERE s.organization_id=_organization_id AND s.business_segment='consulting_services'
   AND (s.enabled_modules='[]'::jsonb OR s.enabled_modules ? 'processes')
   AND (NOT _tasks OR s.enabled_modules='[]'::jsonb OR s.enabled_modules ? 'tasks'));
$$;
REVOKE ALL ON FUNCTION public.consulting_plan_access(uuid,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_consulting_monthly_plan(_organization_id uuid,_process_id uuid,_values jsonb,_expected_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.processes; saved public.consulting_monthly_plans; old_revision integer;
  item jsonb; start_date date; end_date date; return_date date; amount numeric;
BEGIN
 IF NOT public.consulting_plan_access(_organization_id,true,false) THEN RAISE EXCEPTION 'CONSULTING_PLAN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.processes WHERE id=_process_id AND organization_id=_organization_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=p.client_id AND c.organization_id=_organization_id AND c.archived_at IS NULL) THEN RAISE EXCEPTION 'CONSULTING_PLAN_PROJECT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object'
   OR coalesce(jsonb_typeof(_values->'service_name'),'')<>'string'
   OR coalesce(length(trim(_values->>'service_name')),0) NOT BETWEEN 3 AND 160
   OR coalesce(_values->>'status','') NOT IN ('ativo','pausado','encerrado')
   OR coalesce(jsonb_typeof(_values->'monthly_amount'),'')<>'number'
   OR coalesce(jsonb_typeof(_values->'routine'),'')<>'array' THEN RAISE EXCEPTION 'CONSULTING_PLAN_INVALID' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(_values->'routine') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'CONSULTING_PLAN_INVALID' USING ERRCODE='22023'; END IF;
 IF coalesce(_values->>'starts_on','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(_values->>'ends_on','') !~ '^\d{4}-\d{2}-\d{2}$'
    OR (nullif(_values->>'return_on','') IS NOT NULL AND _values->>'return_on' !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'CONSULTING_PLAN_INVALID' USING ERRCODE='22023'; END IF;
 BEGIN
   start_date:=(_values->>'starts_on')::date; end_date:=(_values->>'ends_on')::date; return_date:=nullif(_values->>'return_on','')::date; amount:=(_values->>'monthly_amount')::numeric;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CONSULTING_PLAN_INVALID' USING ERRCODE='22023'; END;
 IF start_date NOT BETWEEN '2000-01-01' AND '2100-12-31' OR end_date NOT BETWEEN start_date AND '2100-12-31'
   OR (return_date IS NOT NULL AND return_date NOT BETWEEN '2000-01-01' AND '2100-12-31')
   OR amount<0 OR amount>9999999999.99 OR amount<>round(amount,2) THEN RAISE EXCEPTION 'CONSULTING_PLAN_INVALID' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(_values->'routine') LOOP
   IF jsonb_typeof(item)<>'object' OR coalesce(jsonb_typeof(item->'title'),'')<>'string' OR coalesce(length(trim(item->>'title')),0) NOT BETWEEN 3 AND 160
     OR coalesce(item->>'day','') !~ '^([1-9]|[12][0-9]|3[01])$' THEN RAISE EXCEPTION 'CONSULTING_PLAN_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT revision INTO old_revision FROM public.consulting_monthly_plans WHERE process_id=_process_id AND organization_id=_organization_id FOR UPDATE;
 IF (FOUND AND _expected_revision IS DISTINCT FROM old_revision) OR (NOT FOUND AND _expected_revision IS NOT NULL) THEN RAISE EXCEPTION 'CONSULTING_PLAN_STALE' USING ERRCODE='40001'; END IF;
 INSERT INTO public.consulting_monthly_plans(process_id,organization_id,service_name,monthly_amount,starts_on,ends_on,status,return_on,routine,created_by,updated_by)
 VALUES(_process_id,_organization_id,trim(_values->>'service_name'),amount,start_date,end_date,_values->>'status',return_date,
   (SELECT jsonb_agg(jsonb_build_object('title',trim(value->>'title'),'day',(value->>'day')::integer)) FROM jsonb_array_elements(_values->'routine')),auth.uid(),auth.uid())
 ON CONFLICT(process_id) DO UPDATE SET service_name=EXCLUDED.service_name,monthly_amount=EXCLUDED.monthly_amount,starts_on=EXCLUDED.starts_on,ends_on=EXCLUDED.ends_on,status=EXCLUDED.status,return_on=EXCLUDED.return_on,routine=EXCLUDED.routine,revision=public.consulting_monthly_plans.revision+1,updated_at=now(),updated_by=auth.uid()
 RETURNING * INTO saved;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'consulting.plan.saved','process',_process_id,jsonb_build_object('revision',saved.revision,'status',saved.status));
 RETURN to_jsonb(saved);
END; $$;

CREATE OR REPLACE FUNCTION public.generate_consulting_plan_month(_organization_id uuid,_process_id uuid,_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.processes; plan public.consulting_monthly_plans; month_start date; month_end date; due date; item jsonb;
  task_id uuid; task_ids uuid[]:=ARRAY[]::uuid[]; existing uuid[];
BEGIN
 IF NOT public.consulting_plan_access(_organization_id,true,true) THEN RAISE EXCEPTION 'CONSULTING_PLAN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF _reference IS NULL OR _reference !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'CONSULTING_PLAN_MONTH_INVALID' USING ERRCODE='22023'; END IF;
 month_start:=(_reference||'-01')::date; month_end:=(month_start+interval '1 month - 1 day')::date;
 SELECT * INTO p FROM public.processes WHERE id=_process_id AND organization_id=_organization_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p.stage::text IN ('finalizado','arquivado','cancelado') OR NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=p.client_id AND c.organization_id=_organization_id AND c.archived_at IS NULL) THEN RAISE EXCEPTION 'CONSULTING_PLAN_PROJECT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO plan FROM public.consulting_monthly_plans WHERE process_id=_process_id AND organization_id=_organization_id FOR UPDATE;
 IF NOT FOUND OR plan.status<>'ativo' THEN RAISE EXCEPTION 'CONSULTING_PLAN_NOT_ACTIVE' USING ERRCODE='22023'; END IF;
 IF month_start>plan.ends_on OR month_end<plan.starts_on THEN RAISE EXCEPTION 'CONSULTING_PLAN_MONTH_OUTSIDE_PERIOD' USING ERRCODE='22023'; END IF;
 SELECT m.task_ids INTO existing FROM public.consulting_plan_months m WHERE m.process_id=_process_id AND m.reference=month_start;
 IF FOUND THEN RETURN jsonb_build_object('created',0,'existing',cardinality(existing)); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(plan.routine) LOOP
   due:=greatest(plan.starts_on,least(plan.ends_on,month_end,month_start+((item->>'day')::integer-1)));
   INSERT INTO public.tasks(organization_id,process_id,client_id,title,description,status,priority,due_at,assignee_name,created_by,updated_by,recurrence_type)
   VALUES(_organization_id,_process_id,p.client_id,trim(item->>'title'),plan.service_name||' · '||_reference,'pendente','media',
     (due::timestamp+interval '12 hours') AT TIME ZONE 'America/Sao_Paulo',p.owner_name,auth.uid(),auth.uid(),'none') RETURNING id INTO task_id;
   task_ids:=array_append(task_ids,task_id);
 END LOOP;
 INSERT INTO public.consulting_plan_months(process_id,reference,task_ids,created_by) VALUES(_process_id,month_start,task_ids,auth.uid());
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'consulting.plan.month_generated','process',_process_id,jsonb_build_object('reference',_reference,'tasks',cardinality(task_ids)));
 RETURN jsonb_build_object('created',cardinality(task_ids),'existing',0);
END; $$;

CREATE OR REPLACE FUNCTION public.read_consulting_plans(_organization_id uuid,_process_id uuid DEFAULT NULL,_reference text DEFAULT NULL,_page integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE result jsonb; tasks jsonb; saved public.consulting_monthly_plans; reference_date date; today date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF NOT public.consulting_plan_access(_organization_id,false,false) THEN RAISE EXCEPTION 'CONSULTING_PLAN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<0 OR _page>1000000 THEN RAISE EXCEPTION 'CONSULTING_PLAN_PAGE_INVALID' USING ERRCODE='22023'; END IF;
 IF _process_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.processes p JOIN public.clients c ON c.id=p.client_id AND c.organization_id=p.organization_id WHERE p.id=_process_id AND p.organization_id=_organization_id AND p.archived_at IS NULL AND c.archived_at IS NULL) THEN RAISE EXCEPTION 'CONSULTING_PLAN_PROJECT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF _reference IS NOT NULL AND _reference !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'CONSULTING_PLAN_MONTH_INVALID' USING ERRCODE='22023'; END IF;
   reference_date:=coalesce((_reference||'-01')::date,date_trunc('month',today)::date);
   SELECT * INTO saved FROM public.consulting_monthly_plans WHERE organization_id=_organization_id AND process_id=_process_id;
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'due_date',(t.due_at AT TIME ZONE 'America/Sao_Paulo')::date,'status',t.status,'deleted',t.deleted_at IS NOT NULL OR t.archived_at IS NOT NULL) ORDER BY t.due_at,t.id),'[]'::jsonb) INTO tasks
     FROM public.consulting_plan_months m JOIN public.tasks t ON t.id=ANY(m.task_ids) AND t.organization_id=_organization_id AND t.process_id=_process_id WHERE m.process_id=_process_id AND m.reference=reference_date;
   RETURN jsonb_build_object('plan',CASE WHEN saved.process_id IS NULL THEN NULL ELSE to_jsonb(saved) END,'generated',EXISTS(SELECT 1 FROM public.consulting_plan_months m WHERE m.process_id=_process_id AND m.reference=reference_date),'tasks',tasks);
 END IF;
 WITH base AS (
   SELECT plan.*,p.code,p.client_id,c.name AS client_name FROM public.consulting_monthly_plans plan
   JOIN public.processes p ON p.id=plan.process_id AND p.organization_id=plan.organization_id
   JOIN public.clients c ON c.id=p.client_id AND c.organization_id=plan.organization_id
   WHERE plan.organization_id=_organization_id AND p.archived_at IS NULL AND c.archived_at IS NULL
 ), page AS (SELECT * FROM base ORDER BY CASE WHEN status='ativo' THEN 0 ELSE 1 END,ends_on,process_id LIMIT 10 OFFSET _page*10)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM base),'items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY CASE WHEN status='ativo' THEN 0 ELSE 1 END,ends_on,process_id) FROM page),'[]'::jsonb),
 'ending',(SELECT count(*) FROM base WHERE status='ativo' AND ends_on BETWEEN today AND today+30),
 'expired',(SELECT count(*) FROM base WHERE status='ativo' AND ends_on<today),
 'returns',(SELECT count(*) FROM base WHERE status='ativo' AND return_on<=today),'today',today) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.save_consulting_monthly_plan(uuid,uuid,jsonb,integer),public.generate_consulting_plan_month(uuid,uuid,text),public.read_consulting_plans(uuid,uuid,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_consulting_monthly_plan(uuid,uuid,jsonb,integer),public.generate_consulting_plan_month(uuid,uuid,text),public.read_consulting_plans(uuid,uuid,text,integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
