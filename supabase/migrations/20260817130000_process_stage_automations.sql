-- Fase 2: ações operacionais disparadas pela etapa do processo.
-- Evolui deliberadamente o motor existente; nenhuma regra é criada por esta migration.

CREATE OR REPLACE FUNCTION public.validate_automation(_trigger text, _conditions jsonb, _action text, _config jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE
  c jsonb;
  allowed text[] := ARRAY['task.created','task.status_changed','task.assignee_changed','task.due_date_changed','task.completed','process.created','process.stage_changed','process.owner_changed','monitoring.created','monitoring.status_changed','monitoring.expiration_changed','monitoring.responsible_changed'];
  actions text[] := ARRAY['create_task','create_checklist_item','update_task_priority','update_task_status','add_task_history','create_notification','add_audit_log'];
  due_text text;
BEGIN
  IF NOT (_trigger = ANY(allowed)) THEN RAISE EXCEPTION 'INVALID_TRIGGER'; END IF;
  IF NOT (_action = ANY(actions)) THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF _action='create_checklist_item' AND _trigger<>ALL(ARRAY['process.created','process.stage_changed','process.owner_changed']) THEN RAISE EXCEPTION 'CHECKLIST_ACTION_REQUIRES_PROCESS_TRIGGER'; END IF;
  IF jsonb_typeof(_conditions) <> 'array' OR jsonb_array_length(_conditions) > 10 OR jsonb_typeof(_config) <> 'object' THEN RAISE EXCEPTION 'INVALID_JSON'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(_conditions) LOOP
    IF c - ARRAY['field','operator','value'] <> '{}'::jsonb OR NOT(c?'field') OR NOT(c?'operator') OR NOT(c->>'operator'=ANY(ARRAY['equals','not_equals','contains','is_empty','is_not_empty','before','after'])) OR c->>'field' !~ '^[a-z_]{1,40}$' THEN RAISE EXCEPTION 'INVALID_CONDITION'; END IF;
  END LOOP;
  IF _config::text ~* '(https?://|javascript:|<script|\m(select|insert|update|delete|drop|alter)\M)' THEN RAISE EXCEPTION 'UNSAFE_CONFIG'; END IF;

  IF _action = 'create_task' THEN
    IF NOT _config?'title' OR length(_config->>'title') NOT BETWEEN 1 AND 160 OR
       length(coalesce(_config->>'description','')) > 2000 OR
       _config - ARRAY['title','description','priority','status','due_in_days','assignee_mode','assignee_id','process_id','client_id','monitoring_item_id'] <> '{}'::jsonb OR
       coalesce(_config->>'priority','media') <> ALL(ARRAY['baixa','media','alta','critica']) OR
       coalesce(_config->>'status','pendente') <> ALL(ARRAY['pendente','em_andamento','aguardando']) OR
       coalesce(_config->>'assignee_mode',CASE WHEN _config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END) <> ALL(ARRAY['process_owner','fixed_user','rule_creator','unassigned']) OR
       (coalesce(_config->>'assignee_mode','')='fixed_user' AND nullif(_config->>'assignee_id','') IS NULL)
    THEN RAISE EXCEPTION 'INVALID_CREATE_TASK_CONFIG'; END IF;
    IF coalesce(_config->>'assignee_mode',CASE WHEN _config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END)='process_owner'
       AND _trigger<>ALL(ARRAY['process.created','process.stage_changed','process.owner_changed'])
       AND nullif(_config->>'process_id','') IS NULL
    THEN RAISE EXCEPTION 'PROCESS_OWNER_REQUIRES_PROCESS'; END IF;
    due_text := _config->>'due_in_days';
  ELSIF _action = 'create_checklist_item' THEN
    IF NOT _config?'title' OR length(_config->>'title') NOT BETWEEN 1 AND 160 OR
       length(coalesce(_config->>'description','')) > 2000 OR
       _config - ARRAY['title','description','required','due_in_days'] <> '{}'::jsonb OR
       (_config?'required' AND jsonb_typeof(_config->'required') <> 'boolean')
    THEN RAISE EXCEPTION 'INVALID_CHECKLIST_CONFIG'; END IF;
    due_text := _config->>'due_in_days';
  END IF;
  IF _action IN ('create_task','create_checklist_item') AND due_text IS NOT NULL AND
     (due_text !~ '^[0-9]+$' OR length(due_text)>3 OR due_text::int NOT BETWEEN 0 AND 365)
  THEN RAISE EXCEPTION 'INVALID_DUE_IN_DAYS'; END IF;

  IF _action='update_task_priority' AND (_config->>'priority' IS NULL OR NOT(_config->>'priority'=ANY(ARRAY['baixa','media','alta','critica'])) OR _config-'priority'<>'{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_PRIORITY'; END IF;
  IF _action='update_task_status' AND (_config->>'status' IS NULL OR NOT(_config->>'status'=ANY(ARRAY['pendente','em_andamento','aguardando','concluida','cancelada','arquivada'])) OR _config-'status'<>'{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF _action IN('add_task_history','add_audit_log') AND (_config->>'message' IS NULL OR length(_config->>'message') NOT BETWEEN 1 AND 500 OR _config-'message'<>'{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  IF _action='create_notification' AND (NOT(_config?'title') OR NOT(_config?'recipient_id') OR _config-ARRAY['title','body','recipient_id','action_url']<>'{}'::jsonb OR coalesce(_config->>'action_url','/') !~ '^/(?!/)[A-Za-z0-9/_?=&.-]*$') THEN RAISE EXCEPTION 'INVALID_NOTIFICATION'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_automation_event(_organization_id uuid,_event_type text,_entity_type text,_entity_id uuid,_payload jsonb,_source_automation_rule_id uuid DEFAULT NULL,_execution_depth integer DEFAULT 0,_event_version text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r public.automation_rules%ROWTYPE; eid uuid; key text; successes int:=0; recipient uuid; task_org uuid;
  process_row public.processes%ROWTYPE; task_id uuid; checklist_id uuid; inherited_process uuid; inherited_client uuid;
  assignee_mode text; safe_error text;
BEGIN
  IF pg_trigger_depth()>4 OR _execution_depth>3 THEN RETURN 0; END IF;
  IF _event_type<>ALL(ARRAY['task.created','task.status_changed','task.assignee_changed','task.due_date_changed','task.completed','process.created','process.stage_changed','process.owner_changed','monitoring.created','monitoring.status_changed','monitoring.expiration_changed','monitoring.responsible_changed']) THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
  FOR r IN SELECT * FROM public.automation_rules WHERE organization_id=_organization_id AND trigger_type=_event_type AND is_active AND archived_at IS NULL AND (id IS DISTINCT FROM _source_automation_rule_id) ORDER BY created_at LOOP
    key:=encode(digest(r.id::text||':'||coalesce(_entity_id::text,'none')||':'||_event_type||':'||coalesce(_event_version,_payload::text),'sha256'),'hex');
    BEGIN
      INSERT INTO public.automation_executions(organization_id,automation_rule_id,event_type,entity_type,entity_id,status,input_payload,source_automation_rule_id,execution_depth,dedupe_key) VALUES(_organization_id,r.id,_event_type,_entity_type,_entity_id,'running',_payload,_source_automation_rule_id,_execution_depth,key) RETURNING id INTO eid;
    EXCEPTION WHEN unique_violation THEN CONTINUE; END;
    BEGIN
      IF NOT public.automation_conditions_match(r.conditions,_payload) THEN
        UPDATE public.automation_executions SET status='skipped',finished_at=now(),output_payload='{"reason":"conditions_not_met"}' WHERE id=eid; CONTINUE;
      END IF;
      process_row:=NULL; inherited_process:=NULL; inherited_client:=NULL; recipient:=NULL; task_id:=NULL; checklist_id:=NULL;
      IF r.action_type IN ('create_task','create_checklist_item') AND _entity_type='process' THEN
        SELECT * INTO process_row FROM public.processes WHERE id=_entity_id AND organization_id=_organization_id AND archived_at IS NULL;
        IF process_row.id IS NULL THEN RAISE EXCEPTION 'PROCESS_NOT_FOUND'; END IF;
        inherited_process := process_row.id; inherited_client := process_row.client_id;
      END IF;

      IF r.action_type='create_task' THEN
        IF _entity_type <> 'process' THEN
          inherited_process := nullif(r.action_config->>'process_id','')::uuid;
          inherited_client := nullif(r.action_config->>'client_id','')::uuid;
          IF inherited_process IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.processes WHERE id=inherited_process AND organization_id=_organization_id) THEN RAISE EXCEPTION 'INVALID_PROCESS_LINK'; END IF;
          IF inherited_client IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clients WHERE id=inherited_client AND organization_id=_organization_id) THEN RAISE EXCEPTION 'INVALID_CLIENT_LINK'; END IF;
          IF inherited_process IS NOT NULL THEN
            SELECT * INTO process_row FROM public.processes WHERE id=inherited_process AND organization_id=_organization_id AND archived_at IS NULL;
            IF process_row.id IS NULL THEN RAISE EXCEPTION 'PROCESS_OWNER_REQUIRES_PROCESS'; END IF;
          END IF;
        END IF;
        assignee_mode:=coalesce(r.action_config->>'assignee_mode',CASE WHEN r.action_config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END);
        IF assignee_mode='process_owner' AND process_row.id IS NULL THEN RAISE EXCEPTION 'PROCESS_OWNER_REQUIRES_PROCESS'; END IF;
        recipient:=CASE assignee_mode WHEN 'process_owner' THEN process_row.owner_id WHEN 'fixed_user' THEN nullif(r.action_config->>'assignee_id','')::uuid WHEN 'rule_creator' THEN r.created_by ELSE NULL END;
        IF recipient IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=recipient AND is_active) THEN RAISE EXCEPTION 'INVALID_ASSIGNEE'; END IF;
        INSERT INTO public.tasks(organization_id,title,description,priority,status,due_at,assignee_id,process_id,client_id,monitoring_item_id,created_by)
        VALUES(_organization_id,r.action_config->>'title',nullif(r.action_config->>'description',''),coalesce(r.action_config->>'priority','media')::public.priority_level,coalesce(r.action_config->>'status','pendente')::public.task_status,CASE WHEN r.action_config?'due_in_days' THEN current_date+(r.action_config->>'due_in_days')::int END,recipient,inherited_process,inherited_client,nullif(r.action_config->>'monitoring_item_id','')::uuid,r.created_by) RETURNING id INTO task_id;
        IF inherited_process IS NOT NULL THEN
          INSERT INTO public.process_movements(organization_id,process_id,description,actor_name,created_by) VALUES(_organization_id,inherited_process,format('Automação %L criou a tarefa %L.',r.name,r.action_config->>'title'),'Automação',r.created_by);
        END IF;
      ELSIF r.action_type='create_checklist_item' THEN
        IF _entity_type <> 'process' OR inherited_process IS NULL THEN RAISE EXCEPTION 'PROCESS_REQUIRED'; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(inherited_process::text,0));
        INSERT INTO public.process_checklist_items(organization_id,process_id,title,description,status,required,due_date,position,created_by)
        SELECT _organization_id,inherited_process,r.action_config->>'title',nullif(r.action_config->>'description',''),'pendente',coalesce((r.action_config->>'required')::boolean,true),CASE WHEN r.action_config?'due_in_days' THEN current_date+(r.action_config->>'due_in_days')::int END,coalesce(max(i.position),0)+1,r.created_by FROM public.process_checklist_items i WHERE i.process_id=inherited_process AND i.organization_id=_organization_id AND i.deleted_at IS NULL RETURNING id INTO checklist_id;
        INSERT INTO public.process_movements(organization_id,process_id,description,actor_name,created_by) VALUES(_organization_id,inherited_process,format('Automação %L criou o item %L.',r.name,r.action_config->>'title'),'Automação',r.created_by);
      ELSIF r.action_type='update_task_priority' THEN UPDATE public.tasks SET priority=(r.action_config->>'priority')::public.priority_level,updated_at=now() WHERE id=_entity_id AND organization_id=_organization_id AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
      ELSIF r.action_type='update_task_status' THEN UPDATE public.tasks SET status=(r.action_config->>'status')::public.task_status,updated_at=now() WHERE id=_entity_id AND organization_id=_organization_id AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
      ELSIF r.action_type='add_task_history' THEN SELECT organization_id INTO task_org FROM public.tasks WHERE id=_entity_id; IF task_org IS DISTINCT FROM _organization_id THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF; INSERT INTO public.task_history(organization_id,task_id,user_id,user_name,action,new_value) VALUES(_organization_id,_entity_id,r.created_by,'Automação','automation.note',r.action_config->>'message');
      ELSIF r.action_type='create_notification' THEN recipient:=(r.action_config->>'recipient_id')::uuid; IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=recipient AND is_active) THEN RAISE EXCEPTION 'INVALID_RECIPIENT'; END IF; INSERT INTO public.notifications(organization_id,user_id,title,body,kind,action_url,dedupe_key) VALUES(_organization_id,recipient,r.action_config->>'title',r.action_config->>'body','automation',r.action_config->>'action_url',key);
      ELSIF r.action_type='add_audit_log' THEN INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,r.created_by,'automation.action',_entity_type,_entity_id,jsonb_build_object('message',r.action_config->>'message','rule_id',r.id)); END IF;
      UPDATE public.automation_executions SET status='success',finished_at=now(),output_payload=jsonb_strip_nulls(jsonb_build_object('action',r.action_type,'task_id',task_id,'checklist_item_id',checklist_id)) WHERE id=eid;
      UPDATE public.automation_rules SET execution_count=execution_count+1,last_executed_at=now() WHERE id=r.id; successes:=successes+1;
    EXCEPTION WHEN OTHERS THEN
      safe_error:=CASE WHEN SQLSTATE='P0001' AND SQLERRM=ANY(ARRAY['INVALID_ASSIGNEE','INVALID_PROCESS_LINK','INVALID_CLIENT_LINK','PROCESS_NOT_FOUND','PROCESS_REQUIRED','PROCESS_OWNER_REQUIRES_PROCESS','TASK_NOT_FOUND','INVALID_RECIPIENT']) THEN SQLERRM ELSE 'AUTOMATION_ACTION_FAILED' END;
      UPDATE public.automation_executions SET status='failed',finished_at=now(),error_code=SQLSTATE,error_message=safe_error WHERE id=eid;
      UPDATE public.automation_rules SET failure_count=failure_count+1,last_executed_at=now() WHERE id=r.id;
    END;
  END LOOP; RETURN successes;
END $$;

CREATE OR REPLACE FUNCTION public.emit_process_automation_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payload jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    payload:=to_jsonb(NEW)||jsonb_build_object('from_stage',NULL,'to_stage',NEW.stage);
    PERFORM public.process_automation_event(NEW.organization_id,'process.created','process',NEW.id,payload,NULL,0,NEW.updated_at::text);
  ELSE
    payload:=to_jsonb(NEW)||jsonb_build_object('from_stage',OLD.stage,'to_stage',NEW.stage);
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN PERFORM public.process_automation_event(NEW.organization_id,'process.stage_changed','process',NEW.id,payload,NULL,0,NEW.updated_at::text); END IF;
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN PERFORM public.process_automation_event(NEW.organization_id,'process.owner_changed','process',NEW.id,payload,NULL,0,NEW.updated_at::text); END IF;
  END IF; RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS processes_automation_events ON public.processes;
CREATE TRIGGER processes_automation_events AFTER INSERT OR UPDATE OF stage,owner_id ON public.processes FOR EACH ROW EXECUTE FUNCTION public.emit_process_automation_event();

REVOKE ALL ON FUNCTION public.validate_automation(text,jsonb,text,jsonb), public.process_automation_event(uuid,text,text,uuid,jsonb,uuid,integer,text) FROM PUBLIC,anon;
