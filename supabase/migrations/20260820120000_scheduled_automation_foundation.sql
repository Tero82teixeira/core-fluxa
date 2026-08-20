-- Stage 21: database-only foundation for tenant-safe scheduled automations.
-- No scheduler is installed here. A trusted database scheduler must invoke
-- process_due_scheduled_automations() without accepting tenant input.

-- Fase 2: ações operacionais disparadas pela etapa do processo.
-- Evolui deliberadamente o motor existente; nenhuma regra é criada por esta migration.

CREATE OR REPLACE FUNCTION public.validate_automation(_trigger text, _conditions jsonb, _action text, _config jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE
  c jsonb;
  allowed text[] := ARRAY['task.created','task.status_changed','task.assignee_changed','task.due_date_changed','task.completed','process.created','process.stage_changed','process.owner_changed','monitoring.created','monitoring.status_changed','monitoring.expiration_changed','monitoring.responsible_changed','scheduled'];
  actions text[] := ARRAY['create_task','create_checklist_item','update_task_priority','update_task_status','add_task_history','create_notification','add_audit_log'];
  due_text text;
BEGIN
  IF NOT (_trigger = ANY(allowed)) THEN RAISE EXCEPTION 'INVALID_TRIGGER'; END IF;
  IF NOT (_action = ANY(actions)) THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF _trigger = 'scheduled' AND (_action <> ALL(ARRAY['create_task','create_notification','add_audit_log']) OR _conditions <> '[]'::jsonb) THEN RAISE EXCEPTION 'INVALID_SCHEDULED_RULE'; END IF;
  IF _action='create_checklist_item' AND _trigger<>ALL(ARRAY['process.created','process.stage_changed','process.owner_changed']) THEN RAISE EXCEPTION 'CHECKLIST_ACTION_REQUIRES_PROCESS_TRIGGER'; END IF;
  IF jsonb_typeof(_conditions) <> 'array' OR jsonb_array_length(_conditions) > 10 OR jsonb_typeof(_config) <> 'object' THEN RAISE EXCEPTION 'INVALID_JSON'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(_conditions) LOOP
    IF c - ARRAY['field','operator','value'] <> '{}'::jsonb OR NOT(c?'field') OR NOT(c?'operator') OR NOT(c->>'operator'=ANY(ARRAY['equals','not_equals','contains','is_empty','is_not_empty','before','after'])) OR c->>'field' !~ '^[a-z_]{1,40}$' THEN RAISE EXCEPTION 'INVALID_CONDITION'; END IF;
  END LOOP;
  IF _config::text ~* '(https?://|javascript:|<script|\m(select|insert|update|delete|drop|alter)\M)' THEN RAISE EXCEPTION 'UNSAFE_CONFIG'; END IF;

  IF _action = 'create_task' THEN
    IF _trigger = 'scheduled' AND (
      _config - ARRAY['title','description','priority','status','due_in_days','assignee_mode','assignee_id'] <> '{}'::jsonb OR
      coalesce(_config->>'assignee_mode',CASE WHEN _config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END) <> ALL(ARRAY['fixed_user','rule_creator','unassigned']) OR
      (coalesce(_config->>'assignee_mode',CASE WHEN _config?'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END) = 'fixed_user') <> (_config ? 'assignee_id')
    ) THEN RAISE EXCEPTION 'INVALID_SCHEDULED_CREATE_TASK_CONFIG'; END IF;
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

ALTER TABLE public.automation_rules
  ADD CONSTRAINT automation_rules_id_organization_key UNIQUE (id, organization_id);

CREATE TABLE public.automation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_rule_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  schedule_type text NOT NULL CHECK (schedule_type IN ('interval_days', 'daily')),
  interval_days integer CHECK (interval_days BETWEEN 1 AND 3650),
  run_at time without time zone,
  timezone text NOT NULL DEFAULT 'UTC',
  last_scheduled_for timestamptz,
  last_executed_at timestamptz,
  next_execution_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_schedules_rule_organization_fkey
    FOREIGN KEY (automation_rule_id, organization_id)
    REFERENCES public.automation_rules(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT automation_schedules_shape_check CHECK (
    (schedule_type = 'interval_days' AND interval_days IS NOT NULL AND run_at IS NULL)
    OR (schedule_type = 'daily' AND interval_days IS NULL AND run_at IS NOT NULL)
  )
);

CREATE INDEX automation_schedules_due_idx
  ON public.automation_schedules(next_execution_at)
  WHERE is_active;
CREATE INDEX automation_schedules_organization_idx
  ON public.automation_schedules(organization_id);

ALTER TABLE public.automation_executions
  ADD COLUMN automation_schedule_id uuid REFERENCES public.automation_schedules(id),
  ADD COLUMN scheduled_for timestamptz;

CREATE UNIQUE INDEX automation_executions_schedule_cycle_idx
  ON public.automation_executions(automation_schedule_id, scheduled_for)
  WHERE automation_schedule_id IS NOT NULL;

ALTER TABLE public.automation_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_schedules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.automation_schedules TO authenticated;
GRANT ALL ON public.automation_schedules TO service_role;

CREATE POLICY automation_schedules_read ON public.automation_schedules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = automation_schedules.organization_id
      AND member.user_id = auth.uid()
      AND member.is_active
  ));

CREATE OR REPLACE FUNCTION public.validate_automation_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.automation_rules AS rule
    WHERE rule.id = NEW.automation_rule_id
      AND rule.organization_id = NEW.organization_id
      AND rule.trigger_type = 'scheduled'
  ) THEN
    RAISE EXCEPTION 'SCHEDULE_REQUIRES_SCHEDULED_RULE';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_automation_schedule_before_write
  BEFORE INSERT OR UPDATE ON public.automation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_automation_schedule();

-- This internal executor deliberately has no organization argument. Tenant scope
-- comes exclusively from each locked schedule and its composite rule foreign key.
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

    execution_key := encode(digest(
      'scheduled:' || schedule_record.id::text || ':' || schedule_record.next_execution_at::text,
      'sha256'
    ), 'hex');

    INSERT INTO public.automation_executions (
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
      -- Recover a cycle that was already reserved by a previous invocation but
      -- whose schedule cursor was not advanced (for example, after a restart).
      UPDATE public.automation_schedules
      SET last_scheduled_for = schedule_record.next_execution_at,
          next_execution_at = next_at
      WHERE id = schedule_record.id
        AND organization_id = schedule_record.organization_id;
      CONTINUE;
    END IF;

    BEGIN
      -- Conditions over old records will be evaluated by later sub-stages. Empty
      -- conditions make this foundation cycle executable and testable today.
      IF schedule_record.conditions <> '[]'::jsonb THEN
        RAISE EXCEPTION 'SCHEDULED_CONDITIONS_NOT_IMPLEMENTED';
      END IF;

      IF schedule_record.action_type = 'create_task' THEN
        assignee_mode := coalesce(
          schedule_record.action_config->>'assignee_mode',
          CASE WHEN schedule_record.action_config ? 'assignee_id' THEN 'fixed_user' ELSE 'unassigned' END
        );
        task_assignee := CASE assignee_mode
          WHEN 'fixed_user' THEN (schedule_record.action_config->>'assignee_id')::uuid
          WHEN 'rule_creator' THEN schedule_record.created_by
          WHEN 'unassigned' THEN NULL
        END;
        IF assignee_mode = 'fixed_user' AND NOT EXISTS (
          SELECT 1 FROM public.organization_members
          WHERE organization_id = schedule_record.organization_id
            AND user_id = task_assignee
            AND is_active
        ) THEN
          RAISE EXCEPTION 'INVALID_RECIPIENT';
        END IF;
        INSERT INTO public.tasks (
          organization_id, title, description, priority, status, due_at,
          assignee_id, created_by
        ) VALUES (
          schedule_record.organization_id,
          schedule_record.action_config->>'title',
          schedule_record.action_config->>'description',
          coalesce(schedule_record.action_config->>'priority', 'media')::public.priority_level,
          coalesce(schedule_record.action_config->>'status', 'pendente')::public.task_status,
          CASE WHEN schedule_record.action_config ? 'due_in_days'
            THEN _as_of + make_interval(days => (schedule_record.action_config->>'due_in_days')::integer)
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
        INSERT INTO public.notifications (
          organization_id, user_id, title, body, kind, action_url, dedupe_key
        ) VALUES (
          schedule_record.organization_id, recipient,
          schedule_record.action_config->>'title', schedule_record.action_config->>'body',
          'automation', schedule_record.action_config->>'action_url', execution_key
        );
      ELSIF schedule_record.action_type = 'add_audit_log' THEN
        INSERT INTO public.audit_logs (
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
          output_payload = jsonb_build_object('action', schedule_record.action_type)
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

REVOKE ALL ON FUNCTION public.validate_automation_schedule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_due_scheduled_automations(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_automation_schedule() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.process_due_scheduled_automations(timestamptz, integer)
  TO postgres, service_role;
