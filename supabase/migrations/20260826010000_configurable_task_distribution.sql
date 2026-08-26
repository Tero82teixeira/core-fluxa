-- Configurable distribution of newly automated tasks by team profile and live workload.
-- Existing and manually created tasks are intentionally unaffected.

ALTER TABLE public.organization_members
  ADD COLUMN distribution_sector text,
  ADD COLUMN distribution_function text,
  ADD COLUMN automatic_task_capacity integer NOT NULL DEFAULT 20,
  ADD COLUMN receives_automatic_tasks boolean NOT NULL DEFAULT false,
  ADD COLUMN last_automatic_task_at timestamptz;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_distribution_sector_length
    CHECK (distribution_sector IS NULL OR length(trim(distribution_sector)) BETWEEN 1 AND 80),
  ADD CONSTRAINT organization_members_distribution_function_length
    CHECK (distribution_function IS NULL OR length(trim(distribution_function)) BETWEEN 1 AND 80),
  ADD CONSTRAINT organization_members_automatic_task_capacity_range
    CHECK (automatic_task_capacity BETWEEN 1 AND 500),
  ADD CONSTRAINT organization_members_distribution_profile_complete
    CHECK (
      NOT receives_automatic_tasks OR (
        distribution_sector IS NOT NULL AND
        distribution_function IS NOT NULL
      )
    );

CREATE INDEX organization_members_task_distribution_idx
  ON public.organization_members(
    organization_id,
    lower(trim(distribution_sector)),
    lower(trim(distribution_function)),
    user_id
  )
  WHERE is_active AND receives_automatic_tasks;

CREATE OR REPLACE FUNCTION public.update_member_task_distribution(
  _member uuid,
  _sector text,
  _function text,
  _capacity integer,
  _receives_automatic_tasks boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
  normalized_sector text := nullif(trim(_sector), '');
  normalized_function text := nullif(trim(_function), '');
BEGIN
  SELECT organization_id INTO target_organization_id
  FROM public.organization_members
  WHERE id = _member
  FOR UPDATE;

  IF target_organization_id IS NULL OR
     NOT public.automation_can_manage(target_organization_id)
  THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _capacity NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'INVALID_CAPACITY';
  END IF;
  IF length(coalesce(normalized_sector, '')) > 80 OR
     length(coalesce(normalized_function, '')) > 80 OR
     (_receives_automatic_tasks AND (
       normalized_sector IS NULL OR normalized_function IS NULL
     ))
  THEN
    RAISE EXCEPTION 'INVALID_DISTRIBUTION_PROFILE';
  END IF;

  UPDATE public.organization_members
  SET distribution_sector = normalized_sector,
      distribution_function = normalized_function,
      automatic_task_capacity = _capacity,
      receives_automatic_tasks = _receives_automatic_tasks,
      updated_at = now()
  WHERE id = _member
    AND organization_id = target_organization_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    target_organization_id, auth.uid(), 'member.task_distribution_updated',
    'member', _member, jsonb_build_object(
      'sector', normalized_sector,
      'function', normalized_function,
      'capacity', _capacity,
      'enabled', _receives_automatic_tasks
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.select_task_distribution_assignee(
  _organization_id uuid,
  _sector text,
  _function text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_user_id uuid;
BEGIN
  IF nullif(trim(_sector), '') IS NULL OR
     nullif(trim(_function), '') IS NULL
  THEN
    RETURN NULL;
  END IF;

  -- Serializes assignments per organization so simultaneous rules observe
  -- the task created immediately before them.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('task-distribution:' || _organization_id::text, 0)
  );

  SELECT member.user_id INTO selected_user_id
  FROM public.organization_members AS member
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS open_tasks
    FROM public.tasks AS task
    WHERE task.organization_id = member.organization_id
      AND task.assignee_id = member.user_id
      AND task.deleted_at IS NULL
      AND task.archived_at IS NULL
      AND task.completed_at IS NULL
      AND task.status::text IN ('pendente', 'em_andamento', 'aguardando')
  ) AS workload
  WHERE member.organization_id = _organization_id
    AND member.is_active
    AND member.receives_automatic_tasks
    AND member.role::text <> 'visualizador'
    AND lower(trim(member.distribution_sector)) = lower(trim(_sector))
    AND lower(trim(member.distribution_function)) = lower(trim(_function))
    AND workload.open_tasks < member.automatic_task_capacity
  ORDER BY
    workload.open_tasks::numeric / member.automatic_task_capacity,
    workload.open_tasks,
    member.last_automatic_task_at NULLS FIRST,
    member.user_id
  LIMIT 1;

  IF selected_user_id IS NOT NULL THEN
    UPDATE public.organization_members
    SET last_automatic_task_at = now(),
        updated_at = now()
    WHERE organization_id = _organization_id
      AND user_id = selected_user_id;
  END IF;

  RETURN selected_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_task_distribution(
  uuid, text, text, integer, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_task_distribution(
  uuid, text, text, integer, boolean
) TO authenticated;

REVOKE ALL ON FUNCTION public.select_task_distribution_assignee(
  uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_task_distribution_assignee(
  uuid, text, text
) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.validate_automation(
  _trigger text, _conditions jsonb, _action text, _config jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c jsonb;
  allowed text[] := ARRAY[
    'task.created','task.status_changed','task.assignee_changed',
    'task.due_date_changed','task.completed','process.created',
    'process.stage_changed','process.owner_changed','monitoring.created',
    'monitoring.status_changed','monitoring.expiration_changed',
    'monitoring.responsible_changed','scheduled'
  ];
  actions text[] := ARRAY[
    'create_task','create_checklist_item','update_task_priority',
    'update_task_status','add_task_history','create_notification',
    'add_audit_log','send_operational_summary'
  ];
  due_text text;
BEGIN
  IF NOT (_trigger = ANY(allowed)) THEN RAISE EXCEPTION 'INVALID_TRIGGER'; END IF;
  IF NOT (_action = ANY(actions)) THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF _trigger = 'scheduled' AND (
    _action <> ALL(ARRAY[
      'create_task','create_notification','add_audit_log','send_operational_summary'
    ]) OR _conditions <> '[]'::jsonb
  ) THEN RAISE EXCEPTION 'INVALID_SCHEDULED_RULE'; END IF;
  IF _action = 'send_operational_summary' AND (
    _trigger <> 'scheduled' OR _conditions <> '[]'::jsonb OR _config <> '{}'::jsonb
  ) THEN RAISE EXCEPTION 'INVALID_OPERATIONAL_SUMMARY'; END IF;
  IF _action='create_checklist_item' AND _trigger<>ALL(ARRAY['process.created','process.stage_changed','process.owner_changed']) THEN RAISE EXCEPTION 'CHECKLIST_ACTION_REQUIRES_PROCESS_TRIGGER'; END IF;
  IF jsonb_typeof(_conditions) <> 'array' OR jsonb_array_length(_conditions) > 10 OR jsonb_typeof(_config) <> 'object' THEN RAISE EXCEPTION 'INVALID_JSON'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(_conditions) LOOP
    IF c - ARRAY['field','operator','value'] <> '{}'::jsonb OR NOT(c?'field') OR NOT(c?'operator') OR NOT(c->>'operator'=ANY(ARRAY['equals','not_equals','contains','is_empty','is_not_empty','before','after'])) OR c->>'field' !~ '^[a-z_]{1,40}$' THEN RAISE EXCEPTION 'INVALID_CONDITION'; END IF;
  END LOOP;
  IF _config::text ~* '(https?://|javascript:|<script|\m(select|insert|update|delete|drop|alter)\M)' THEN RAISE EXCEPTION 'UNSAFE_CONFIG'; END IF;

  IF _action = 'create_task' THEN
    IF _trigger = 'scheduled' AND (
      _config - ARRAY['title','description','priority','status','due_in_days','assignee_mode','assignee_id','distribution_sector','distribution_function'] <> '{}'::jsonb OR
      coalesce(_config->>'assignee_mode',CASE WHEN _config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END) <> ALL(ARRAY['fixed_user','rule_creator','unassigned','least_loaded']) OR
      (coalesce(_config->>'assignee_mode',CASE WHEN _config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END) = 'fixed_user') <> (_config ? 'assignee_id') OR
      (coalesce(_config->>'assignee_mode','') = 'least_loaded' AND (
        nullif(trim(_config->>'distribution_sector'),'') IS NULL OR
        nullif(trim(_config->>'distribution_function'),'') IS NULL OR
        length(trim(_config->>'distribution_sector')) > 80 OR
        length(trim(_config->>'distribution_function')) > 80
      ))
    ) THEN RAISE EXCEPTION 'INVALID_SCHEDULED_CREATE_TASK_CONFIG'; END IF;
    IF NOT _config?'title' OR length(_config->>'title') NOT BETWEEN 1 AND 160 OR
       length(coalesce(_config->>'description','')) > 2000 OR
       _config - ARRAY['title','description','priority','status','due_in_days','assignee_mode','assignee_id','process_id','client_id','monitoring_item_id','distribution_sector','distribution_function'] <> '{}'::jsonb OR
       coalesce(_config->>'priority','media') <> ALL(ARRAY['baixa','media','alta','critica']) OR
       coalesce(_config->>'status','pendente') <> ALL(ARRAY['pendente','em_andamento','aguardando']) OR
       coalesce(_config->>'assignee_mode',CASE WHEN _config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END) <> ALL(ARRAY['process_owner','fixed_user','rule_creator','unassigned','least_loaded']) OR
       (coalesce(_config->>'assignee_mode','')='fixed_user' AND nullif(_config->>'assignee_id','') IS NULL) OR
       (coalesce(_config->>'assignee_mode','')='least_loaded' AND (
         nullif(trim(_config->>'distribution_sector'),'') IS NULL OR
         nullif(trim(_config->>'distribution_function'),'') IS NULL OR
         length(trim(_config->>'distribution_sector')) > 80 OR
         length(trim(_config->>'distribution_function')) > 80
       ))
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
END;
$$;

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
    key:=encode(extensions.digest(r.id::text||':'||coalesce(_entity_id::text,'none')||':'||_event_type||':'||coalesce(_event_version,_payload::text),'sha256'::text),'hex');
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
        IF assignee_mode = 'least_loaded' THEN
          recipient := public.select_task_distribution_assignee(
            _organization_id,
            r.action_config->>'distribution_sector',
            r.action_config->>'distribution_function'
          );
          IF recipient IS NULL THEN RAISE EXCEPTION 'NO_ELIGIBLE_ASSIGNEE'; END IF;
        ELSE
          recipient:=CASE assignee_mode WHEN 'process_owner' THEN process_row.owner_id WHEN 'fixed_user' THEN nullif(r.action_config->>'assignee_id','')::uuid WHEN 'rule_creator' THEN r.created_by ELSE NULL END;
        END IF;
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
      UPDATE public.automation_executions SET status='success',finished_at=now(),output_payload=jsonb_strip_nulls(jsonb_build_object('action',r.action_type,'task_id',task_id,'checklist_item_id',checklist_id,'assignee_id',recipient)) WHERE id=eid;
      UPDATE public.automation_rules SET execution_count=execution_count+1,last_executed_at=now() WHERE id=r.id; successes:=successes+1;
    EXCEPTION WHEN OTHERS THEN
      safe_error:=CASE WHEN SQLSTATE='P0001' AND SQLERRM=ANY(ARRAY['INVALID_ASSIGNEE','INVALID_PROCESS_LINK','INVALID_CLIENT_LINK','PROCESS_NOT_FOUND','PROCESS_REQUIRED','PROCESS_OWNER_REQUIRES_PROCESS','TASK_NOT_FOUND','INVALID_RECIPIENT','NO_ELIGIBLE_ASSIGNEE']) THEN SQLERRM ELSE 'AUTOMATION_ACTION_FAILED' END;
      UPDATE public.automation_executions SET status='failed',finished_at=now(),error_code=SQLSTATE,error_message=safe_error WHERE id=eid;
      UPDATE public.automation_rules SET failure_count=failure_count+1,last_executed_at=now() WHERE id=r.id;
    END;
  END LOOP; RETURN successes;
END $$;

CREATE OR REPLACE FUNCTION public.process_due_scheduled_automations(
  _as_of timestamptz DEFAULT now(),
  _batch_size integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  schedule_record record;
  execution_id uuid;
  execution_key text;
  processed_count integer := 0;
  recipient uuid;
  assignee_mode text;
  task_assignee uuid;
  next_at timestamptz;
  safe_error text;
  summary_notifications integer := 0;
BEGIN
  IF _batch_size NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_BATCH_SIZE';
  END IF;

  FOR schedule_record IN
    SELECT schedule.*, rule.action_type, rule.action_config, rule.conditions,
           rule.created_by, rule.archived_at, rule.is_active AS rule_is_active
    FROM public.automation_schedules AS schedule
    JOIN public.automation_rules AS rule
      ON rule.id = schedule.automation_rule_id
     AND rule.organization_id = schedule.organization_id
    WHERE schedule.is_active
      AND rule.is_active
      AND rule.archived_at IS NULL
      AND rule.trigger_type = 'scheduled'
      AND schedule.next_execution_at <= _as_of
    ORDER BY schedule.next_execution_at, schedule.id
    FOR UPDATE OF schedule SKIP LOCKED
    LIMIT _batch_size
  LOOP
    next_at := CASE schedule_record.schedule_type
      WHEN 'interval_days' THEN schedule_record.next_execution_at
        + make_interval(days => schedule_record.interval_days)
      WHEN 'daily' THEN (
        ((schedule_record.next_execution_at AT TIME ZONE schedule_record.timezone)::date + 1)
        + schedule_record.run_at
      ) AT TIME ZONE schedule_record.timezone
    END;

    execution_key := encode(extensions.digest(
      'scheduled:' || schedule_record.id::text || ':' ||
        schedule_record.next_execution_at::text,
      'sha256'
    ), 'hex');

    INSERT INTO public.automation_executions(
      organization_id, automation_rule_id, automation_schedule_id, scheduled_for,
      event_type, entity_type, status, input_payload, dedupe_key
    ) VALUES (
      schedule_record.organization_id, schedule_record.automation_rule_id,
      schedule_record.id, schedule_record.next_execution_at, 'scheduled',
      'schedule', 'running', jsonb_build_object(
        'scheduled_for', schedule_record.next_execution_at,
        'timezone', schedule_record.timezone
      ), execution_key
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO execution_id;

    IF execution_id IS NULL THEN
      UPDATE public.automation_schedules
      SET last_scheduled_for = schedule_record.next_execution_at,
          next_execution_at = next_at
      WHERE id = schedule_record.id
        AND organization_id = schedule_record.organization_id;
      CONTINUE;
    END IF;

    BEGIN
      IF schedule_record.conditions <> '[]'::jsonb THEN
        RAISE EXCEPTION 'SCHEDULED_CONDITIONS_NOT_IMPLEMENTED';
      END IF;
      summary_notifications := 0;

      IF schedule_record.action_type = 'create_task' THEN
        assignee_mode := coalesce(
          schedule_record.action_config->>'assignee_mode',
          CASE WHEN schedule_record.action_config ? 'assignee_id'
            THEN 'fixed_user' ELSE 'unassigned' END
        );
        IF assignee_mode = 'least_loaded' THEN
          task_assignee := public.select_task_distribution_assignee(
            schedule_record.organization_id,
            schedule_record.action_config->>'distribution_sector',
            schedule_record.action_config->>'distribution_function'
          );
          IF task_assignee IS NULL THEN RAISE EXCEPTION 'NO_ELIGIBLE_ASSIGNEE'; END IF;
        ELSE
          task_assignee := CASE assignee_mode
            WHEN 'fixed_user' THEN (schedule_record.action_config->>'assignee_id')::uuid
            WHEN 'rule_creator' THEN schedule_record.created_by
            WHEN 'unassigned' THEN NULL
          END;
        END IF;
        IF assignee_mode = 'fixed_user' AND NOT EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_id = schedule_record.organization_id
            AND user_id = task_assignee AND is_active
        ) THEN
          RAISE EXCEPTION 'INVALID_RECIPIENT';
        END IF;
        INSERT INTO public.tasks(
          organization_id, title, description, priority, status, due_at,
          assignee_id, created_by
        ) VALUES (
          schedule_record.organization_id,
          schedule_record.action_config->>'title',
          schedule_record.action_config->>'description',
          coalesce(schedule_record.action_config->>'priority', 'media')::public.priority_level,
          coalesce(schedule_record.action_config->>'status', 'pendente')::public.task_status,
          CASE WHEN schedule_record.action_config ? 'due_in_days'
            THEN _as_of + make_interval(
              days => (schedule_record.action_config->>'due_in_days')::integer
            )
          END,
          task_assignee,
          schedule_record.created_by
        );
      ELSIF schedule_record.action_type = 'create_notification' THEN
        recipient := (schedule_record.action_config->>'recipient_id')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_id = schedule_record.organization_id
            AND user_id = recipient AND is_active
        ) THEN
          RAISE EXCEPTION 'INVALID_RECIPIENT';
        END IF;
        INSERT INTO public.notifications(
          organization_id, user_id, title, body, kind, action_url, dedupe_key
        ) VALUES (
          schedule_record.organization_id, recipient,
          schedule_record.action_config->>'title',
          schedule_record.action_config->>'body', 'automation',
          schedule_record.action_config->>'action_url', execution_key
        );
      ELSIF schedule_record.action_type = 'send_operational_summary' THEN
        summary_notifications := public.create_operational_summary_notifications(
          schedule_record.organization_id,
          schedule_record.id,
          schedule_record.next_execution_at
        );
      ELSIF schedule_record.action_type = 'add_audit_log' THEN
        INSERT INTO public.audit_logs(
          organization_id, actor_id, action, entity, entity_id, metadata
        ) VALUES (
          schedule_record.organization_id, schedule_record.created_by,
          'automation.action', 'automation_schedule', schedule_record.id,
          jsonb_build_object(
            'message', schedule_record.action_config->>'message',
            'rule_id', schedule_record.automation_rule_id,
            'scheduled_for', schedule_record.next_execution_at
          )
        );
      ELSE
        RAISE EXCEPTION 'SCHEDULED_ACTION_REQUIRES_ENTITY';
      END IF;

      UPDATE public.automation_executions
      SET status = 'success', finished_at = now(),
          output_payload = jsonb_build_object(
            'action', schedule_record.action_type,
            'notifications_created', summary_notifications,
            'assignee_id', task_assignee
          )
      WHERE id = execution_id;
      UPDATE public.automation_rules
      SET execution_count = execution_count + 1, last_executed_at = now()
      WHERE id = schedule_record.automation_rule_id
        AND organization_id = schedule_record.organization_id;
      processed_count := processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      safe_error := left(SQLERRM, 500);
      UPDATE public.automation_executions
      SET status = 'failed', finished_at = now(), error_code = SQLSTATE,
          error_message = safe_error
      WHERE id = execution_id;
      UPDATE public.automation_rules
      SET failure_count = failure_count + 1, last_executed_at = now()
      WHERE id = schedule_record.automation_rule_id
        AND organization_id = schedule_record.organization_id;
    END;

    UPDATE public.automation_schedules
    SET last_scheduled_for = schedule_record.next_execution_at,
        last_executed_at = now(), next_execution_at = next_at
    WHERE id = schedule_record.id
      AND organization_id = schedule_record.organization_id;
    execution_id := NULL;
  END LOOP;

  RETURN processed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_automation(text, jsonb, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_automation(text, jsonb, text, jsonb)
  TO postgres, service_role;

REVOKE ALL ON FUNCTION public.process_automation_event(
  uuid, text, text, uuid, jsonb, uuid, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_automation_event(
  uuid, text, text, uuid, jsonb, uuid, integer, text
) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.process_due_scheduled_automations(
  timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_scheduled_automations(
  timestamptz, integer
) TO postgres, service_role;
