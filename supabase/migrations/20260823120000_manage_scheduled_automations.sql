-- Stage 22: authenticated management for scheduled automations.
-- Rule and schedule mutations are intentionally atomic and tenant-derived.

CREATE OR REPLACE FUNCTION public.create_automation_rule(
  _organization_id uuid, name text, description text, trigger_type text,
  conditions jsonb, action_type text, action_config jsonb, is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule_id uuid;
BEGIN
  IF trigger_type = 'scheduled' THEN
    RAISE EXCEPTION 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC';
  END IF;
  IF NOT public.automation_can_manage(_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  PERFORM public.validate_automation(trigger_type, conditions, action_type, action_config);
  INSERT INTO public.automation_rules(
    organization_id, name, description, trigger_type, conditions, action_type,
    action_config, is_active, created_by, creator_name
  )
  SELECT _organization_id, create_automation_rule.name,
         create_automation_rule.description, create_automation_rule.trigger_type,
         create_automation_rule.conditions, create_automation_rule.action_type,
         create_automation_rule.action_config, create_automation_rule.is_active,
         auth.uid(), profile.full_name
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid()
  RETURNING id INTO rule_id;
  IF rule_id IS NULL THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'automation.created', 'automation_rule', rule_id,
    jsonb_build_object('name', name)
  );
  RETURN rule_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_automation_rule(
  _rule_id uuid, name text, description text, trigger_type text,
  conditions jsonb, action_type text, action_config jsonb, is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
  current_trigger text;
BEGIN
  SELECT rule.organization_id, rule.trigger_type
  INTO target_organization_id, current_trigger
  FROM public.automation_rules AS rule
  WHERE rule.id = _rule_id AND rule.archived_at IS NULL;
  IF target_organization_id IS NULL OR
     NOT public.automation_can_manage(target_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF trigger_type = 'scheduled' OR current_trigger = 'scheduled' THEN
    RAISE EXCEPTION 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC';
  END IF;
  PERFORM public.validate_automation(trigger_type, conditions, action_type, action_config);
  UPDATE public.automation_rules AS rule
  SET name = update_automation_rule.name,
      description = update_automation_rule.description,
      trigger_type = update_automation_rule.trigger_type,
      conditions = update_automation_rule.conditions,
      action_type = update_automation_rule.action_type,
      action_config = update_automation_rule.action_config,
      is_active = update_automation_rule.is_active,
      updated_at = now()
  WHERE rule.id = _rule_id
    AND rule.organization_id = target_organization_id;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id
  ) VALUES (
    target_organization_id, auth.uid(), 'automation.updated',
    'automation_rule', _rule_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_automation_rule_active(
  _rule_id uuid, _is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
  current_trigger text;
BEGIN
  SELECT rule.organization_id, rule.trigger_type
  INTO target_organization_id, current_trigger
  FROM public.automation_rules AS rule
  WHERE rule.id = _rule_id AND rule.archived_at IS NULL;
  IF target_organization_id IS NULL OR
     NOT public.automation_can_manage(target_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF current_trigger = 'scheduled' THEN
    RAISE EXCEPTION 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC';
  END IF;
  UPDATE public.automation_rules
  SET is_active = _is_active, updated_at = now()
  WHERE id = _rule_id
    AND automation_rules.organization_id = target_organization_id;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    target_organization_id, auth.uid(), 'automation.active_changed', 'automation_rule',
    _rule_id, jsonb_build_object('active', _is_active)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.duplicate_automation_rule(_rule_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_rule public.automation_rules%ROWTYPE;
  new_id uuid;
BEGIN
  SELECT * INTO source_rule
  FROM public.automation_rules
  WHERE id = _rule_id AND archived_at IS NULL;
  IF source_rule.id IS NULL OR NOT public.automation_can_manage(source_rule.organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF source_rule.trigger_type = 'scheduled' THEN
    RAISE EXCEPTION 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC';
  END IF;
  INSERT INTO public.automation_rules(
    organization_id, name, description, trigger_type, conditions, action_type,
    action_config, is_active, created_by, creator_name
  ) VALUES (
    source_rule.organization_id, left(source_rule.name || ' (cópia)', 120),
    source_rule.description, source_rule.trigger_type, source_rule.conditions,
    source_rule.action_type, source_rule.action_config, false, auth.uid(),
    source_rule.creator_name
  ) RETURNING id INTO new_id;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id
  ) VALUES (
    source_rule.organization_id, auth.uid(), 'automation.duplicated',
    'automation_rule', new_id
  );
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_automation_rule(_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
  current_trigger text;
BEGIN
  SELECT rule.organization_id, rule.trigger_type
  INTO target_organization_id, current_trigger
  FROM public.automation_rules AS rule
  WHERE rule.id = _rule_id AND rule.archived_at IS NULL;
  IF target_organization_id IS NULL OR
     NOT public.automation_can_manage(target_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF current_trigger = 'scheduled' THEN
    RAISE EXCEPTION 'SCHEDULED_RULE_REQUIRES_DEDICATED_RPC';
  END IF;
  UPDATE public.automation_rules
  SET archived_at = now(), is_active = false, updated_at = now()
  WHERE id = _rule_id
    AND automation_rules.organization_id = target_organization_id;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id
  ) VALUES (
    target_organization_id, auth.uid(), 'automation.archived',
    'automation_rule', _rule_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_scheduled_automation(
  _organization_id uuid, _name text, _description text, _action_type text,
  _action_config jsonb, _schedule_type text, _interval_days integer,
  _run_at time without time zone, _timezone text,
  _next_execution_at timestamptz, _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule_id uuid;
  creator_name text;
BEGIN
  IF NOT public.automation_can_manage(_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _schedule_type IS NULL OR
     _schedule_type NOT IN ('interval_days', 'daily') OR
     (_schedule_type = 'interval_days' AND
       (_interval_days IS NULL OR _interval_days NOT BETWEEN 1 AND 3650 OR
        _run_at IS NOT NULL)) OR
     (_schedule_type = 'daily' AND
       (_interval_days IS NOT NULL OR _run_at IS NULL)) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE';
  END IF;
  IF _next_execution_at IS NULL OR _next_execution_at <= now() THEN
    RAISE EXCEPTION 'INVALID_NEXT_EXECUTION_AT';
  END IF;
  PERFORM public.validate_automation('scheduled', '[]'::jsonb, _action_type, _action_config);
  SELECT profile.full_name INTO creator_name
  FROM public.profiles AS profile WHERE profile.id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  INSERT INTO public.automation_rules(
    organization_id, name, description, trigger_type, conditions, action_type,
    action_config, is_active, created_by, creator_name
  ) VALUES (
    _organization_id, _name, _description, 'scheduled', '[]'::jsonb,
    _action_type, _action_config, _is_active, auth.uid(), creator_name
  ) RETURNING id INTO rule_id;
  INSERT INTO public.automation_schedules(
    automation_rule_id, organization_id, schedule_type, interval_days, run_at,
    timezone, next_execution_at, is_active
  ) VALUES (
    rule_id, _organization_id, _schedule_type, _interval_days, _run_at,
    _timezone, _next_execution_at, _is_active
  );
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'automation.scheduled_created',
    'automation_rule', rule_id,
    jsonb_build_object('schedule_type', _schedule_type, 'timezone', _timezone)
  );
  RETURN rule_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_scheduled_automation(
  _rule_id uuid, _name text, _description text, _action_type text,
  _action_config jsonb, _schedule_type text, _interval_days integer,
  _run_at time without time zone, _timezone text,
  _next_execution_at timestamptz, _is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
BEGIN
  SELECT rule.organization_id INTO target_organization_id
  FROM public.automation_rules AS rule
  WHERE rule.id = _rule_id AND rule.trigger_type = 'scheduled'
    AND rule.archived_at IS NULL
  FOR UPDATE;
  IF target_organization_id IS NULL OR
     NOT public.automation_can_manage(target_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _schedule_type IS NULL OR
     _schedule_type NOT IN ('interval_days', 'daily') OR
     (_schedule_type = 'interval_days' AND
       (_interval_days IS NULL OR _interval_days NOT BETWEEN 1 AND 3650 OR
        _run_at IS NOT NULL)) OR
     (_schedule_type = 'daily' AND
       (_interval_days IS NOT NULL OR _run_at IS NULL)) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE';
  END IF;
  IF _next_execution_at IS NULL OR _next_execution_at <= now() THEN
    RAISE EXCEPTION 'INVALID_NEXT_EXECUTION_AT';
  END IF;
  PERFORM public.validate_automation('scheduled', '[]'::jsonb, _action_type, _action_config);
  UPDATE public.automation_rules AS rule
  SET name = _name, description = _description, action_type = _action_type,
      action_config = _action_config, is_active = _is_active, updated_at = now()
  WHERE rule.id = _rule_id
    AND rule.organization_id = target_organization_id;
  UPDATE public.automation_schedules AS schedule
  SET schedule_type = _schedule_type, interval_days = _interval_days,
      run_at = _run_at, timezone = _timezone,
      next_execution_at = _next_execution_at, is_active = _is_active
  WHERE schedule.automation_rule_id = _rule_id
    AND schedule.organization_id = target_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHEDULE_NOT_FOUND'; END IF;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    target_organization_id, auth.uid(), 'automation.scheduled_updated',
    'automation_rule', _rule_id,
    jsonb_build_object('schedule_type', _schedule_type, 'timezone', _timezone)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_scheduled_automation_active(
  _rule_id uuid, _is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
BEGIN
  SELECT rule.organization_id INTO target_organization_id
  FROM public.automation_rules AS rule
  WHERE rule.id = _rule_id AND rule.trigger_type = 'scheduled'
    AND rule.archived_at IS NULL
  FOR UPDATE;
  IF target_organization_id IS NULL OR
     NOT public.automation_can_manage(target_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.automation_rules
  SET is_active = _is_active, updated_at = now()
  WHERE id = _rule_id
    AND automation_rules.organization_id = target_organization_id;
  UPDATE public.automation_schedules
  SET is_active = _is_active
  WHERE automation_rule_id = _rule_id
    AND automation_schedules.organization_id = target_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHEDULE_NOT_FOUND'; END IF;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    target_organization_id, auth.uid(), 'automation.scheduled_active_changed',
    'automation_rule', _rule_id, jsonb_build_object('active', _is_active)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_scheduled_automation(_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_organization_id uuid;
BEGIN
  SELECT rule.organization_id INTO target_organization_id
  FROM public.automation_rules AS rule
  WHERE rule.id = _rule_id AND rule.trigger_type = 'scheduled'
    AND rule.archived_at IS NULL
  FOR UPDATE;
  IF target_organization_id IS NULL OR
     NOT public.automation_can_manage(target_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.automation_schedules
  SET is_active = false
  WHERE automation_rule_id = _rule_id
    AND automation_schedules.organization_id = target_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHEDULE_NOT_FOUND'; END IF;
  UPDATE public.automation_rules
  SET archived_at = now(), is_active = false, updated_at = now()
  WHERE id = _rule_id
    AND automation_rules.organization_id = target_organization_id;
  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id
  ) VALUES (
    target_organization_id, auth.uid(), 'automation.scheduled_archived',
    'automation_rule', _rule_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_scheduled_automation(
  uuid, text, text, text, jsonb, text, integer, time without time zone,
  text, timestamptz, boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_scheduled_automation(
  uuid, text, text, text, jsonb, text, integer, time without time zone,
  text, timestamptz, boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_scheduled_automation_active(uuid, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_scheduled_automation(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_scheduled_automation(
  uuid, text, text, text, jsonb, text, integer, time without time zone,
  text, timestamptz, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_scheduled_automation(
  uuid, text, text, text, jsonb, text, integer, time without time zone,
  text, timestamptz, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_scheduled_automation_active(uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_scheduled_automation(uuid)
  TO authenticated;
