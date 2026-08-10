-- FLUXA internal automations: additive, tenant-scoped and without external execution.
CREATE TABLE IF NOT EXISTS public.automation_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120), description text CHECK (char_length(description)<=500),
 trigger_type text NOT NULL, conditions jsonb NOT NULL DEFAULT '[]', action_type text NOT NULL, action_config jsonb NOT NULL DEFAULT '{}',
 is_active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL, creator_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
 last_executed_at timestamptz, execution_count integer NOT NULL DEFAULT 0 CHECK(execution_count>=0), failure_count integer NOT NULL DEFAULT 0 CHECK(failure_count>=0)
);
CREATE TABLE IF NOT EXISTS public.automation_executions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), automation_rule_id uuid NOT NULL REFERENCES public.automation_rules(id),
 event_type text NOT NULL, entity_type text NOT NULL, entity_id uuid, status text NOT NULL CHECK(status IN('running','success','failed','skipped')),
 input_payload jsonb NOT NULL DEFAULT '{}', output_payload jsonb, error_code text, error_message text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 source_automation_rule_id uuid REFERENCES public.automation_rules(id), execution_depth smallint NOT NULL DEFAULT 0 CHECK(execution_depth BETWEEN 0 AND 3), dedupe_key text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS automation_executions_dedupe_idx ON public.automation_executions(dedupe_key);
CREATE INDEX IF NOT EXISTS automation_rules_org_idx ON public.automation_rules(organization_id); CREATE INDEX IF NOT EXISTS automation_rules_active_idx ON public.automation_rules(is_active); CREATE INDEX IF NOT EXISTS automation_rules_trigger_idx ON public.automation_rules(trigger_type); CREATE INDEX IF NOT EXISTS automation_rules_archived_idx ON public.automation_rules(archived_at);
CREATE INDEX IF NOT EXISTS automation_executions_rule_idx ON public.automation_executions(automation_rule_id); CREATE INDEX IF NOT EXISTS automation_executions_org_idx ON public.automation_executions(organization_id); CREATE INDEX IF NOT EXISTS automation_executions_status_idx ON public.automation_executions(status); CREATE INDEX IF NOT EXISTS automation_executions_created_idx ON public.automation_executions(created_at DESC);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY; ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_rules, public.automation_executions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.automation_rules, public.automation_executions TO authenticated; GRANT ALL ON public.automation_rules, public.automation_executions TO service_role;
CREATE POLICY automation_rules_read ON public.automation_rules FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=automation_rules.organization_id AND m.user_id=auth.uid() AND m.is_active));
CREATE POLICY automation_executions_read ON public.automation_executions FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=automation_executions.organization_id AND m.user_id=auth.uid() AND m.is_active));

CREATE OR REPLACE FUNCTION public.automation_can_manage(_org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=_org AND m.user_id=auth.uid() AND m.is_active AND m.role::text IN('proprietario','administrador','superadmin')) $$;
CREATE OR REPLACE FUNCTION public.validate_automation(_trigger text,_conditions jsonb,_action text,_config jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE c jsonb; allowed text[]:=ARRAY['task.created','task.status_changed','task.assignee_changed','task.due_date_changed','task.completed','process.created','process.stage_changed','process.owner_changed','monitoring.created','monitoring.status_changed','monitoring.expiration_changed','monitoring.responsible_changed']; actions text[]:=ARRAY['create_task','update_task_priority','update_task_status','add_task_history','create_notification','add_audit_log'];
BEGIN
 IF NOT(_trigger=ANY(allowed)) THEN RAISE EXCEPTION 'INVALID_TRIGGER'; END IF; IF NOT(_action=ANY(actions)) THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 IF jsonb_typeof(_conditions)<>'array' OR jsonb_array_length(_conditions)>10 OR jsonb_typeof(_config)<>'object' THEN RAISE EXCEPTION 'INVALID_JSON'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(_conditions) LOOP IF c - ARRAY['field','operator','value'] <> '{}'::jsonb OR NOT(c?'field') OR NOT(c?'operator') OR NOT(c->>'operator'=ANY(ARRAY['equals','not_equals','contains','is_empty','is_not_empty','before','after'])) OR c->>'field' !~ '^[a-z_]{1,40}$' THEN RAISE EXCEPTION 'INVALID_CONDITION'; END IF; END LOOP;
 IF _config::text ~* '(https?://|javascript:|<script|\b(select|insert|update|delete|drop|alter)\b)' THEN RAISE EXCEPTION 'UNSAFE_CONFIG'; END IF;
 IF _action='create_task' AND (NOT _config?'title' OR length(_config->>'title') NOT BETWEEN 1 AND 160 OR _config - ARRAY['title','description','priority','status','due_in_days','assignee_id','process_id','client_id','monitoring_item_id'] <> '{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_CREATE_TASK_CONFIG'; END IF;
 IF _action='update_task_priority' AND (_config->>'priority' IS NULL OR NOT(_config->>'priority'=ANY(ARRAY['baixa','media','alta','critica'])) OR _config - 'priority' <> '{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_PRIORITY'; END IF;
 IF _action='update_task_status' AND (_config->>'status' IS NULL OR NOT(_config->>'status'=ANY(ARRAY['pendente','em_andamento','aguardando','concluida','cancelada','arquivada'])) OR _config - 'status' <> '{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
 IF _action IN('add_task_history','add_audit_log') AND (_config->>'message' IS NULL OR length(_config->>'message') NOT BETWEEN 1 AND 500 OR _config-'message'<>'{}'::jsonb) THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
 IF _action='create_notification' AND (NOT(_config?'title') OR NOT(_config?'recipient_id') OR _config-ARRAY['title','body','recipient_id','action_url']<>'{}'::jsonb OR coalesce(_config->>'action_url','/') !~ '^/(?!/)[A-Za-z0-9/_?=&.-]*$') THEN RAISE EXCEPTION 'INVALID_NOTIFICATION'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_automation_rule(_organization_id uuid,name text,description text,trigger_type text,conditions jsonb,action_type text,action_config jsonb,is_active boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE rid uuid; BEGIN IF NOT public.automation_can_manage(_organization_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF; PERFORM public.validate_automation(trigger_type,conditions,action_type,action_config); INSERT INTO public.automation_rules(organization_id,name,description,trigger_type,conditions,action_type,action_config,is_active,created_by,creator_name) SELECT _organization_id,name,description,trigger_type,conditions,action_type,action_config,is_active,auth.uid(),p.full_name FROM public.profiles p WHERE p.id=auth.uid() RETURNING id INTO rid; INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'automation.created','automation_rule',rid,jsonb_build_object('name',name)); RETURN rid; END $$;
CREATE OR REPLACE FUNCTION public.update_automation_rule(_rule_id uuid,name text,description text,trigger_type text,conditions jsonb,action_type text,action_config jsonb,is_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE org uuid; BEGIN SELECT organization_id INTO org FROM public.automation_rules WHERE id=_rule_id AND archived_at IS NULL; IF org IS NULL OR NOT public.automation_can_manage(org) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF; PERFORM public.validate_automation(trigger_type,conditions,action_type,action_config); UPDATE public.automation_rules SET name=update_automation_rule.name,description=update_automation_rule.description,trigger_type=update_automation_rule.trigger_type,conditions=update_automation_rule.conditions,action_type=update_automation_rule.action_type,action_config=update_automation_rule.action_config,is_active=update_automation_rule.is_active,updated_at=now() WHERE id=_rule_id AND organization_id=org; INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id) VALUES(org,auth.uid(),'automation.updated','automation_rule',_rule_id); END $$;
CREATE OR REPLACE FUNCTION public.set_automation_rule_active(_rule_id uuid,_is_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE org uuid; BEGIN SELECT organization_id INTO org FROM public.automation_rules WHERE id=_rule_id AND archived_at IS NULL; IF org IS NULL OR NOT public.automation_can_manage(org) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF; UPDATE public.automation_rules SET is_active=_is_active,updated_at=now() WHERE id=_rule_id AND organization_id=org; INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(org,auth.uid(),'automation.active_changed','automation_rule',_rule_id,jsonb_build_object('active',_is_active)); END $$;
CREATE OR REPLACE FUNCTION public.duplicate_automation_rule(_rule_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.automation_rules%ROWTYPE; newid uuid; BEGIN SELECT * INTO r FROM public.automation_rules WHERE id=_rule_id AND archived_at IS NULL; IF r.id IS NULL OR NOT public.automation_can_manage(r.organization_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF; INSERT INTO public.automation_rules(organization_id,name,description,trigger_type,conditions,action_type,action_config,is_active,created_by,creator_name) VALUES(r.organization_id,left(r.name||' (cópia)',120),r.description,r.trigger_type,r.conditions,r.action_type,r.action_config,false,auth.uid(),r.creator_name) RETURNING id INTO newid; INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id) VALUES(r.organization_id,auth.uid(),'automation.duplicated','automation_rule',newid); RETURN newid; END $$;
CREATE OR REPLACE FUNCTION public.archive_automation_rule(_rule_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE org uuid; BEGIN SELECT organization_id INTO org FROM public.automation_rules WHERE id=_rule_id AND archived_at IS NULL; IF org IS NULL OR NOT public.automation_can_manage(org) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF; UPDATE public.automation_rules SET archived_at=now(),is_active=false,updated_at=now() WHERE id=_rule_id; INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id) VALUES(org,auth.uid(),'automation.archived','automation_rule',_rule_id); END $$;
CREATE OR REPLACE FUNCTION public.automation_conditions_match(_conditions jsonb,_payload jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE
 c jsonb;
 actual text;
 expected text;
 condition_failed boolean;
BEGIN
 FOR c IN SELECT value FROM jsonb_array_elements(_conditions) LOOP
  actual := _payload->>(c->>'field');
  expected := c->>'value';
  condition_failed := CASE c->>'operator'
    WHEN 'equals' THEN actual IS DISTINCT FROM expected
    WHEN 'not_equals' THEN actual IS NOT DISTINCT FROM expected
    WHEN 'contains' THEN position(lower(coalesce(expected,'')) in lower(coalesce(actual,''))) = 0
    WHEN 'is_empty' THEN actual IS NOT NULL AND actual <> ''
    WHEN 'is_not_empty' THEN actual IS NULL OR actual = ''
    WHEN 'before' THEN actual IS NULL OR actual::timestamptz >= expected::timestamptz
    WHEN 'after' THEN actual IS NULL OR actual::timestamptz <= expected::timestamptz
    ELSE true
  END;

  IF condition_failed THEN
   RETURN false;
  END IF;
 END LOOP;

 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.process_automation_event(_organization_id uuid,_event_type text,_entity_type text,_entity_id uuid,_payload jsonb,_source_automation_rule_id uuid DEFAULT NULL,_execution_depth integer DEFAULT 0,_event_version text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.automation_rules%ROWTYPE; eid uuid; key text; successes int:=0; recipient uuid; task_org uuid;
BEGIN
 IF pg_trigger_depth()>4 OR _execution_depth>3 THEN RETURN 0; END IF;
 IF _event_type<>ALL(ARRAY['task.created','task.status_changed','task.assignee_changed','task.due_date_changed','task.completed','process.created','process.stage_changed','process.owner_changed','monitoring.created','monitoring.status_changed','monitoring.expiration_changed','monitoring.responsible_changed']) THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
 FOR r IN SELECT * FROM public.automation_rules WHERE organization_id=_organization_id AND trigger_type=_event_type AND is_active AND archived_at IS NULL AND (id IS DISTINCT FROM _source_automation_rule_id) ORDER BY created_at LOOP
  key:=encode(digest(r.id::text||':'||coalesce(_entity_id::text,'none')||':'||_event_type||':'||coalesce(_event_version,_payload::text),'sha256'),'hex');
  BEGIN
   INSERT INTO public.automation_executions(organization_id,automation_rule_id,event_type,entity_type,entity_id,status,input_payload,source_automation_rule_id,execution_depth,dedupe_key) VALUES(_organization_id,r.id,_event_type,_entity_type,_entity_id,'running',_payload,_source_automation_rule_id,_execution_depth,key) RETURNING id INTO eid;
  EXCEPTION WHEN unique_violation THEN CONTINUE; END;
  BEGIN
   IF NOT public.automation_conditions_match(r.conditions,_payload) THEN UPDATE public.automation_executions SET status='skipped',finished_at=now(),output_payload='{"reason":"conditions_not_met"}' WHERE id=eid; CONTINUE; END IF;
   IF r.action_type='create_task' THEN
    IF r.action_config?'assignee_id' AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=(r.action_config->>'assignee_id')::uuid AND is_active) THEN RAISE EXCEPTION 'INVALID_RECIPIENT'; END IF;
    INSERT INTO public.tasks(organization_id,title,description,priority,status,due_at,assignee_id,process_id,client_id,monitoring_item_id,created_by) VALUES(_organization_id,r.action_config->>'title',r.action_config->>'description',coalesce(r.action_config->>'priority','media')::public.priority_level,coalesce(r.action_config->>'status','pendente')::public.task_status,CASE WHEN r.action_config?'due_in_days' THEN now()+make_interval(days=>(r.action_config->>'due_in_days')::int) END,(r.action_config->>'assignee_id')::uuid,coalesce((r.action_config->>'process_id')::uuid,CASE WHEN _entity_type='process' THEN _entity_id END),coalesce((r.action_config->>'client_id')::uuid,NULL),(r.action_config->>'monitoring_item_id')::uuid,r.created_by);
   ELSIF r.action_type='update_task_priority' THEN UPDATE public.tasks SET priority=(r.action_config->>'priority')::public.priority_level,updated_at=now() WHERE id=_entity_id AND organization_id=_organization_id AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
   ELSIF r.action_type='update_task_status' THEN UPDATE public.tasks SET status=(r.action_config->>'status')::public.task_status,updated_at=now() WHERE id=_entity_id AND organization_id=_organization_id AND archived_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF;
   ELSIF r.action_type='add_task_history' THEN SELECT organization_id INTO task_org FROM public.tasks WHERE id=_entity_id; IF task_org IS DISTINCT FROM _organization_id THEN RAISE EXCEPTION 'TASK_NOT_FOUND'; END IF; INSERT INTO public.task_history(organization_id,task_id,user_id,user_name,action,new_value) VALUES(_organization_id,_entity_id,r.created_by,'Automação','automation.note',r.action_config->>'message');
   ELSIF r.action_type='create_notification' THEN recipient:=(r.action_config->>'recipient_id')::uuid; IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=recipient AND is_active) THEN RAISE EXCEPTION 'INVALID_RECIPIENT'; END IF; INSERT INTO public.notifications(organization_id,user_id,title,body,kind,action_url,dedupe_key) VALUES(_organization_id,recipient,r.action_config->>'title',r.action_config->>'body','automation',r.action_config->>'action_url',key);
   ELSIF r.action_type='add_audit_log' THEN INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,r.created_by,'automation.action',_entity_type,_entity_id,jsonb_build_object('message',r.action_config->>'message','rule_id',r.id)); END IF;
   UPDATE public.automation_executions SET status='success',finished_at=now(),output_payload=jsonb_build_object('action',r.action_type) WHERE id=eid; UPDATE public.automation_rules SET execution_count=execution_count+1,last_executed_at=now() WHERE id=r.id; successes:=successes+1;
  EXCEPTION WHEN OTHERS THEN UPDATE public.automation_executions SET status='failed',finished_at=now(),error_code=SQLSTATE,error_message=left(SQLERRM,500) WHERE id=eid; UPDATE public.automation_rules SET failure_count=failure_count+1,last_executed_at=now() WHERE id=r.id; END;
 END LOOP; RETURN successes;
END $$;

CREATE OR REPLACE FUNCTION public.emit_task_automation_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' THEN PERFORM public.process_automation_event(NEW.organization_id,'task.created','task',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text);
 ELSE
  IF OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.process_automation_event(NEW.organization_id,CASE WHEN NEW.status::text='concluida' THEN 'task.completed' ELSE 'task.status_changed' END,'task',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF;
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN PERFORM public.process_automation_event(NEW.organization_id,'task.assignee_changed','task',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF;
  IF OLD.due_at IS DISTINCT FROM NEW.due_at THEN PERFORM public.process_automation_event(NEW.organization_id,'task.due_date_changed','task',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER tasks_automation_events AFTER INSERT OR UPDATE OF status,assignee_id,due_at ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.emit_task_automation_event();
CREATE OR REPLACE FUNCTION public.emit_process_automation_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF TG_OP='INSERT' THEN PERFORM public.process_automation_event(NEW.organization_id,'process.created','process',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); ELSE IF OLD.stage IS DISTINCT FROM NEW.stage THEN PERFORM public.process_automation_event(NEW.organization_id,'process.stage_changed','process',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF; IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN PERFORM public.process_automation_event(NEW.organization_id,'process.owner_changed','process',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF; END IF; RETURN NEW; END $$;
CREATE TRIGGER processes_automation_events AFTER INSERT OR UPDATE OF stage,owner_id ON public.processes FOR EACH ROW EXECUTE FUNCTION public.emit_process_automation_event();
CREATE OR REPLACE FUNCTION public.emit_monitoring_automation_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF TG_OP='INSERT' THEN PERFORM public.process_automation_event(NEW.organization_id,'monitoring.created','monitoring',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); ELSE IF OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.process_automation_event(NEW.organization_id,'monitoring.status_changed','monitoring',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF; IF OLD.expiration_date IS DISTINCT FROM NEW.expiration_date THEN PERFORM public.process_automation_event(NEW.organization_id,'monitoring.expiration_changed','monitoring',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF; IF OLD.responsible_user_id IS DISTINCT FROM NEW.responsible_user_id THEN PERFORM public.process_automation_event(NEW.organization_id,'monitoring.responsible_changed','monitoring',NEW.id,to_jsonb(NEW),NULL,0,NEW.updated_at::text); END IF; END IF; RETURN NEW; END $$;
CREATE TRIGGER monitoring_automation_events AFTER INSERT OR UPDATE OF status,expiration_date,responsible_user_id ON public.monitoring_items FOR EACH ROW EXECUTE FUNCTION public.emit_monitoring_automation_event();

REVOKE ALL ON FUNCTION public.automation_can_manage(uuid),public.validate_automation(text,jsonb,text,jsonb),public.automation_conditions_match(jsonb,jsonb),public.process_automation_event(uuid,text,text,uuid,jsonb,uuid,integer,text),public.create_automation_rule(uuid,text,text,text,jsonb,text,jsonb,boolean),public.update_automation_rule(uuid,text,text,text,jsonb,text,jsonb,boolean),public.set_automation_rule_active(uuid,boolean),public.duplicate_automation_rule(uuid),public.archive_automation_rule(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_automation_rule(uuid,text,text,text,jsonb,text,jsonb,boolean),public.update_automation_rule(uuid,text,text,text,jsonb,text,jsonb,boolean),public.set_automation_rule_active(uuid,boolean),public.duplicate_automation_rule(uuid),public.archive_automation_rule(uuid) TO authenticated;
REVOKE DELETE ON public.automation_rules,public.automation_executions FROM PUBLIC,anon,authenticated;
