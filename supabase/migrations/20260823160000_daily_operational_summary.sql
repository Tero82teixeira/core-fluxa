-- Stage 25: scheduled daily summaries from the existing operational monitoring view.
-- Recipients are derived only from active members of the schedule tenant. Resolved and
-- ignored alerts are excluded, organization notification preferences are respected, and
-- one notification per recipient/cycle is enforced by the existing dedupe index.

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
END;
$$;

CREATE OR REPLACE FUNCTION public.create_operational_summary_notifications(
  _organization_id uuid,
  _automation_schedule_id uuid,
  _scheduled_for timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preferences jsonb;
  show_financial boolean;
  show_communication boolean;
  show_documents boolean;
  created_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.automation_schedules AS schedule
    JOIN public.automation_rules AS rule
      ON rule.id = schedule.automation_rule_id
     AND rule.organization_id = schedule.organization_id
    WHERE schedule.id = _automation_schedule_id
      AND schedule.organization_id = _organization_id
      AND rule.trigger_type = 'scheduled'
      AND rule.action_type = 'send_operational_summary'
      AND rule.action_config = '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'INVALID_OPERATIONAL_SUMMARY_SCHEDULE';
  END IF;

  SELECT
    coalesce(settings.notification_preferences, '{
      "overdue_tasks":true,
      "stale_processes":true,
      "overdue_communications":true,
      "overdue_accounts":true,
      "expiring_documents":true,
      "critical_monitoring":true
    }'::jsonb),
    coalesce(settings.monitoring_show_financial, true),
    coalesce(settings.monitoring_show_communication, true),
    coalesce(settings.monitoring_show_documents, true)
  INTO preferences, show_financial, show_communication, show_documents
  FROM public.organization_settings AS settings
  WHERE settings.organization_id = _organization_id;

  preferences := coalesce(preferences, '{
    "overdue_tasks":true,
    "stale_processes":true,
    "overdue_communications":true,
    "overdue_accounts":true,
    "expiring_documents":true,
    "critical_monitoring":true
  }'::jsonb);
  show_financial := coalesce(show_financial, true);
  show_communication := coalesce(show_communication, true);
  show_documents := coalesce(show_documents, true);

  WITH eligible_alerts AS (
    SELECT
      alert.source_type,
      alert.source_id,
      alert.alert_kind,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.organization_members AS member
          WHERE member.organization_id = _organization_id
            AND member.user_id = alert.assigned_to AND member.is_active
        ) THEN alert.assigned_to
        WHEN EXISTS (
          SELECT 1 FROM public.organization_members AS member
          WHERE member.organization_id = _organization_id
            AND member.user_id = alert.responsible_id AND member.is_active
        ) THEN alert.responsible_id
      END AS recipient_id
    FROM public.operational_monitoring_alerts AS alert
    WHERE alert.organization_id = _organization_id
      AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
      AND (show_financial OR alert.source_type <> 'financeiro')
      AND (show_communication OR alert.source_type <> 'comunicacao')
      AND (show_documents OR alert.source_type <> 'documento')
      AND (
        ((preferences->>'overdue_tasks') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'tarefa_atrasada')
        OR ((preferences->>'stale_processes') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'processo_sem_movimentacao')
        OR ((preferences->>'overdue_communications') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'retorno_atrasado')
        OR ((preferences->>'overdue_accounts') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'financeiro_vencido')
        OR ((preferences->>'expiring_documents') IS DISTINCT FROM 'false'
          AND alert.alert_kind IN ('documento_vencido', 'documento_vencendo'))
        OR ((preferences->>'critical_monitoring') IS DISTINCT FROM 'false'
          AND coalesce(alert.priority_override, alert.suggested_priority) = 'critica')
      )
  ), recipient_alerts AS (
    SELECT alert.recipient_id, alert.source_type, false AS is_unassigned
    FROM eligible_alerts AS alert
    WHERE alert.recipient_id IS NOT NULL
    UNION ALL
    SELECT manager.user_id, alert.source_type, true
    FROM eligible_alerts AS alert
    JOIN public.organization_members AS manager
      ON manager.organization_id = _organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE alert.recipient_id IS NULL
  ), summaries AS (
    SELECT
      recipient_id,
      count(*)::integer AS total,
      count(*) FILTER (WHERE source_type = 'tarefa')::integer AS tasks,
      count(*) FILTER (WHERE source_type = 'processo')::integer AS processes,
      count(*) FILTER (WHERE source_type = 'documento')::integer AS documents,
      count(*) FILTER (WHERE source_type = 'comunicacao')::integer AS communications,
      count(*) FILTER (WHERE source_type = 'financeiro')::integer AS financial,
      count(*) FILTER (WHERE is_unassigned)::integer AS unassigned
    FROM recipient_alerts
    GROUP BY recipient_id
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, action_url, dedupe_key
  )
  SELECT
    _organization_id,
    summary.recipient_id,
    format('Resumo diário: %s pendência(s)', summary.total),
    format(
      '%s tarefa(s), %s processo(s), %s documento(s), %s retorno(s) e %s conta(s).%s',
      summary.tasks, summary.processes, summary.documents,
      summary.communications, summary.financial,
      CASE WHEN summary.unassigned > 0
        THEN format(' %s item(ns) ainda sem responsável.', summary.unassigned)
        ELSE ''
      END
    ),
    'monitoring',
    '/monitoramento',
    'operational-summary:' || _automation_schedule_id::text || ':' ||
      _scheduled_for::text || ':' || summary.recipient_id::text
  FROM summaries AS summary
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_automation_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rule_action text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE';
  END IF;

  SELECT rule.action_type
  INTO rule_action
  FROM public.automation_rules AS rule
  WHERE rule.id = NEW.automation_rule_id
    AND rule.organization_id = NEW.organization_id
    AND rule.trigger_type = 'scheduled';

  IF rule_action IS NULL THEN
    RAISE EXCEPTION 'SCHEDULE_REQUIRES_SCHEDULED_RULE';
  END IF;
  IF rule_action = 'send_operational_summary' AND NEW.schedule_type <> 'daily' THEN
    RAISE EXCEPTION 'OPERATIONAL_SUMMARY_REQUIRES_DAILY_SCHEDULE';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

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
        task_assignee := CASE assignee_mode
          WHEN 'fixed_user' THEN (schedule_record.action_config->>'assignee_id')::uuid
          WHEN 'rule_creator' THEN schedule_record.created_by
          WHEN 'unassigned' THEN NULL
        END;
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
            'notifications_created', summary_notifications
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

REVOKE ALL ON FUNCTION public.create_operational_summary_notifications(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_operational_summary_notifications(
  uuid, uuid, timestamptz
) TO postgres;

REVOKE ALL ON FUNCTION public.validate_automation_schedule()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_automation_schedule()
  TO postgres, service_role;

REVOKE ALL ON FUNCTION public.process_due_scheduled_automations(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_scheduled_automations(timestamptz, integer)
  TO postgres, service_role;
