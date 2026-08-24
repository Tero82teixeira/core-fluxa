-- Stage 30: notify active process owners when a process remains without
-- movement, then escalate to management seven civil days later.
-- This scan creates internal notifications only and reuses the existing clock.

CREATE OR REPLACE FUNCTION public.create_stale_process_notifications()
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
      coalesce(settings.stale_process_days, 14) AS stale_process_days,
      coalesce(settings.notification_preferences, '{}'::jsonb) AS preferences,
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
        settings.notification_preferences->>'stale_processes', 'true'
      ) <> 'false'
  ), process_activity AS (
    SELECT
      process.organization_id,
      process.id AS process_id,
      process.code,
      process.title,
      process.owner_id,
      config.stale_process_days,
      config.preferences,
      coalesce(
        process.last_movement_at, process.updated_at, process.created_at
      ) AS last_activity_at,
      (
        (now() AT TIME ZONE config.timezone_name)::date
        - (
          coalesce(
            process.last_movement_at, process.updated_at, process.created_at
          ) AT TIME ZONE config.timezone_name
        )::date
      )::integer AS inactive_days
    FROM public.processes AS process
    JOIN organization_config AS config
      ON config.organization_id = process.organization_id
    WHERE process.archived_at IS NULL
      AND process.stage::text NOT IN ('finalizado', 'arquivado', 'cancelado')
  ), eligible_processes AS (
    SELECT
      process.*,
      CASE
        WHEN process.inactive_days >= process.stale_process_days + 7 THEN 2
        ELSE 1
      END AS notice_stage,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = process.organization_id
            AND member.user_id = stale_state.assigned_to
            AND member.is_active
        ) THEN stale_state.assigned_to
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = process.organization_id
            AND member.user_id = process.owner_id
            AND member.is_active
        ) THEN process.owner_id
      END AS responsible_id
    FROM process_activity AS process
    LEFT JOIN public.monitoring_states AS stale_state
      ON stale_state.organization_id = process.organization_id
     AND stale_state.source_type = 'processo'
     AND stale_state.source_id = process.process_id
     AND stale_state.alert_kind = 'processo_sem_movimentacao'
    WHERE process.inactive_days >= process.stale_process_days
      AND coalesce(stale_state.monitoring_status, 'novo')
        NOT IN ('resolvido', 'ignorado')
      AND NOT (
        coalesce(process.preferences->>'critical_monitoring', 'true') <> 'false'
        AND EXISTS (
          SELECT 1
          FROM public.operational_monitoring_alerts AS alert
          WHERE alert.organization_id = process.organization_id
            AND alert.source_type = 'processo'
            AND alert.source_id = process.process_id
            AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
            AND coalesce(alert.priority_override, alert.suggested_priority)
              = 'critica'
        )
      )
  ), assigned_processes AS (
    SELECT process.*
    FROM eligible_processes AS process
    WHERE process.responsible_id IS NOT NULL
  ), recipients AS (
    SELECT process.*, process.responsible_id AS user_id
    FROM assigned_processes AS process

    UNION

    SELECT process.*, manager.user_id
    FROM assigned_processes AS process
    JOIN public.organization_members AS manager
      ON manager.organization_id = process.organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE process.notice_stage = 2
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    process.organization_id,
    process.user_id,
    CASE process.notice_stage
      WHEN 1 THEN 'Processo sem movimentação: '
      ELSE 'Escalonamento — processo parado: '
    END || left(
      coalesce(
        nullif(trim(process.title), ''),
        nullif(trim(process.code), ''),
        'Processo sem título'
      ),
      110
    ),
    CASE process.notice_stage
      WHEN 1 THEN format(
        'Sem movimentação há %s dias. Revise o processo e registre o próximo andamento.',
        process.inactive_days
      )
      ELSE format(
        'Sem movimentação há %s dias. O responsável e a gestão foram avisados.',
        process.inactive_days
      )
    END,
    'process',
    'processo',
    process.process_id,
    '/processos/' || process.process_id::text,
    'stale-process:' || process.process_id::text || ':' ||
      to_char(
        process.last_activity_at AT TIME ZONE 'UTC',
        'YYYYMMDDHH24MISS.US'
      ) || ':' || process.stale_process_days::text || ':' ||
      process.notice_stage::text || ':' || process.user_id::text
  FROM recipients AS process
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Keep this scan isolated from scheduled actions and the five existing
-- notification scans. No extra pg_cron job is created by this migration.
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
  stale_process_count integer := 0;
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

  BEGIN
    stale_process_count := public.create_stale_process_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_process_count := -1;
    RAISE WARNING 'STALE_PROCESS_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_process_notifications_created', stale_process_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stale_process_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_stale_process_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
