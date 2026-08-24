-- Stage 31: notify active communication owners when a scheduled follow-up is
-- overdue, then escalate to management on the third civil day.
-- This scan creates internal notifications only and reuses the existing clock.

CREATE OR REPLACE FUNCTION public.create_overdue_communication_notifications()
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
      AND coalesce(settings.monitoring_show_communication, true)
      AND coalesce(
        settings.notification_preferences->>'overdue_communications', 'true'
      ) <> 'false'
  ), overdue_threads AS (
    SELECT
      thread.organization_id,
      thread.id AS thread_id,
      thread.subject,
      thread.assigned_to,
      thread.follow_up_at,
      config.preferences,
      (
        (now() AT TIME ZONE config.timezone_name)::date
        - (thread.follow_up_at AT TIME ZONE config.timezone_name)::date
      )::integer AS overdue_days
    FROM public.communication_threads AS thread
    JOIN organization_config AS config
      ON config.organization_id = thread.organization_id
    WHERE thread.follow_up_at IS NOT NULL
      AND thread.archived_at IS NULL
      AND thread.status::text NOT IN ('resolvida', 'arquivada')
  ), eligible_threads AS (
    SELECT
      thread.*,
      CASE WHEN thread.overdue_days >= 3 THEN 2 ELSE 1 END AS notice_stage,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = thread.organization_id
            AND member.user_id = monitoring_state.assigned_to
            AND member.is_active
        ) THEN monitoring_state.assigned_to
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = thread.organization_id
            AND member.user_id = thread.assigned_to
            AND member.is_active
        ) THEN thread.assigned_to
      END AS responsible_id
    FROM overdue_threads AS thread
    LEFT JOIN public.monitoring_states AS monitoring_state
      ON monitoring_state.organization_id = thread.organization_id
     AND monitoring_state.source_type = 'comunicacao'
     AND monitoring_state.source_id = thread.thread_id
     AND monitoring_state.alert_kind = 'retorno_atrasado'
    WHERE thread.overdue_days >= 1
      AND coalesce(monitoring_state.monitoring_status, 'novo')
        NOT IN ('resolvido', 'ignorado')
      AND NOT (
        coalesce(thread.preferences->>'critical_monitoring', 'true') <> 'false'
        AND EXISTS (
          SELECT 1
          FROM public.operational_monitoring_alerts AS alert
          WHERE alert.organization_id = thread.organization_id
            AND alert.source_type = 'comunicacao'
            AND alert.source_id = thread.thread_id
            AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
            AND coalesce(alert.priority_override, alert.suggested_priority)
              = 'critica'
        )
      )
  ), assigned_threads AS (
    SELECT thread.*
    FROM eligible_threads AS thread
    WHERE thread.responsible_id IS NOT NULL
  ), recipients AS (
    SELECT thread.*, thread.responsible_id AS user_id
    FROM assigned_threads AS thread

    UNION

    SELECT thread.*, manager.user_id
    FROM assigned_threads AS thread
    JOIN public.organization_members AS manager
      ON manager.organization_id = thread.organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE thread.notice_stage = 2
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    thread.organization_id,
    thread.user_id,
    CASE thread.notice_stage
      WHEN 1 THEN 'Retorno de cliente atrasado: '
      ELSE 'Escalonamento — retorno atrasado: '
    END || left(
      coalesce(nullif(trim(thread.subject), ''), 'Comunicação sem assunto'),
      110
    ),
    CASE thread.notice_stage
      WHEN 1 THEN format(
        'O retorno está atrasado há %s %s. Entre em contato ou reprograme o acompanhamento.',
        thread.overdue_days,
        CASE WHEN thread.overdue_days = 1 THEN 'dia' ELSE 'dias' END
      )
      ELSE format(
        'O retorno está atrasado há %s dias. O responsável e a gestão foram avisados.',
        thread.overdue_days
      )
    END,
    'communication',
    'comunicacao',
    thread.thread_id,
    '/comunicacao',
    'overdue-communication:' || thread.thread_id::text || ':' ||
      to_char(
        thread.follow_up_at AT TIME ZONE 'UTC',
        'YYYYMMDDHH24MISS.US'
      ) || ':' || thread.notice_stage::text || ':' || thread.user_id::text
  FROM recipients AS thread
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Keep the new scan isolated from scheduled actions and all existing
-- notification scans. No additional pg_cron job is created here.
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
  overdue_communication_count integer := 0;
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

  BEGIN
    overdue_communication_count :=
      public.create_overdue_communication_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_communication_count := -1;
    RAISE WARNING 'OVERDUE_COMMUNICATION_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_overdue_communication_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_overdue_communication_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
