-- Stage 29: escalate assigned overdue tasks at 1, 3 and 7 civil days.
-- This scan only creates internal notifications and reuses the existing clock.

CREATE OR REPLACE FUNCTION public.create_overdue_task_escalation_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_count integer := 0;
BEGIN
  WITH organization_config AS (
    SELECT
      organization.id AS organization_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM pg_catalog.pg_timezone_names AS zone
          WHERE zone.name = settings.timezone
        ) THEN settings.timezone
        ELSE 'America/Sao_Paulo'
      END AS timezone_name
    FROM public.organizations AS organization
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    WHERE organization.archived_at IS NULL
      AND coalesce(
        settings.notification_preferences->>'overdue_tasks', 'true'
      ) <> 'false'
  ), configured_organizations AS (
    SELECT
      config.organization_id,
      (now() AT TIME ZONE config.timezone_name)::date AS local_today
    FROM organization_config AS config
  ), eligible_tasks AS (
    SELECT
      task.organization_id,
      task.id AS task_id,
      task.title,
      task.assignee_id,
      (task.due_at AT TIME ZONE 'UTC')::date AS due_on,
      (config.local_today
        - (task.due_at AT TIME ZONE 'UTC')::date)::integer AS overdue_days
    FROM public.tasks AS task
    JOIN configured_organizations AS config
      ON config.organization_id = task.organization_id
    JOIN public.organization_members AS assignee
      ON assignee.organization_id = task.organization_id
     AND assignee.user_id = task.assignee_id
     AND assignee.is_active
    WHERE task.due_at IS NOT NULL
      AND task.assignee_id IS NOT NULL
      AND task.archived_at IS NULL
      AND task.deleted_at IS NULL
      AND task.completed_at IS NULL
      AND task.status::text NOT IN ('concluida', 'cancelada', 'arquivada')
      AND task.due_at >= (
        (config.local_today - 7)::timestamp AT TIME ZONE 'UTC'
      )
      AND task.due_at < (
        config.local_today::timestamp AT TIME ZONE 'UTC'
      )
      AND (config.local_today
        - (task.due_at AT TIME ZONE 'UTC')::date) = ANY (ARRAY[1, 3, 7])
  ), recipients AS (
    SELECT task.*, task.assignee_id AS user_id
    FROM eligible_tasks AS task
    WHERE task.overdue_days IN (1, 3)

    UNION

    SELECT task.*, manager.user_id
    FROM eligible_tasks AS task
    JOIN public.organization_members AS manager
      ON manager.organization_id = task.organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE task.overdue_days IN (3, 7)
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    task.organization_id,
    task.user_id,
    CASE task.overdue_days
      WHEN 1 THEN 'Tarefa atrasada há 1 dia: '
      WHEN 3 THEN 'Escalonamento — 3 dias de atraso: '
      ELSE 'Escalonamento crítico — 7 dias de atraso: '
    END || left(
      coalesce(nullif(trim(task.title), ''), 'Tarefa sem título'), 110
    ),
    CASE task.overdue_days
      WHEN 1 THEN format(
        'Esta tarefa venceu em %s. Regularize o prazo ou atualize o status.',
        to_char(task.due_on, 'DD/MM/YYYY')
      )
      WHEN 3 THEN format(
        'Esta tarefa venceu em %s. O responsável e a gestão foram avisados.',
        to_char(task.due_on, 'DD/MM/YYYY')
      )
      ELSE format(
        'Esta tarefa venceu em %s. A gestão foi avisada para acompanhamento.',
        to_char(task.due_on, 'DD/MM/YYYY')
      )
    END,
    'task',
    'tarefa',
    task.task_id,
    '/tarefas',
    'overdue-task-escalation:' || task.task_id::text || ':' ||
      task.due_on::text || ':' || task.overdue_days::text || ':' ||
      task.user_id::text
  FROM recipients AS task
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scheduled_count integer;
  critical_count integer := 0;
  unassigned_count integer := 0;
  deadline_count integer := 0;
  overdue_escalation_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    critical_count := public.create_critical_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    critical_count := -1;
    RAISE WARNING 'CRITICAL_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    unassigned_count := public.create_unassigned_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    unassigned_count := -1;
    RAISE WARNING 'UNASSIGNED_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    deadline_count := public.create_deadline_reminder_notifications();
  EXCEPTION WHEN OTHERS THEN
    deadline_count := -1;
    RAISE WARNING 'DEADLINE_REMINDER_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_escalation_count :=
      public.create_overdue_task_escalation_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_escalation_count := -1;
    RAISE WARNING 'OVERDUE_TASK_ESCALATION_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_overdue_task_escalation_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_overdue_task_escalation_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
