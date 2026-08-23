-- Stage 26: immediate internal notifications for critical operational alerts.
-- The existing fifteen-minute database job remains the only clock. This stage
-- adds no HTTP request, Edge Function, secret or user-supplied tenant scope.

CREATE OR REPLACE FUNCTION public.create_critical_monitoring_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_count integer := 0;
BEGIN
  WITH eligible_alerts AS (
    SELECT
      alert.organization_id,
      alert.source_type,
      alert.source_id,
      alert.alert_kind,
      alert.title,
      alert.reason,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = alert.organization_id
            AND member.user_id = alert.assigned_to
            AND member.is_active
        ) THEN alert.assigned_to
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = alert.organization_id
            AND member.user_id = alert.responsible_id
            AND member.is_active
        ) THEN alert.responsible_id
      END AS recipient_id,
      coalesce(reopen.reopened_at::text, 'initial') AS episode
    FROM public.operational_monitoring_alerts AS alert
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = alert.organization_id
    LEFT JOIN public.monitoring_states AS state
      ON state.organization_id = alert.organization_id
     AND state.source_type = alert.source_type
     AND state.source_id = alert.source_id
     AND state.alert_kind = alert.alert_kind
    LEFT JOIN LATERAL (
      SELECT max(history.created_at) AS reopened_at
      FROM public.monitoring_state_history AS history
      WHERE history.monitoring_state_id = state.id
        AND history.organization_id = alert.organization_id
        AND history.action = 'reaberto'
    ) AS reopen ON true
    WHERE coalesce(alert.priority_override, alert.suggested_priority) = 'critica'
      AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
      AND coalesce(settings.notification_preferences->>'critical_monitoring', 'true') <> 'false'
      AND (coalesce(settings.monitoring_show_financial, true)
        OR alert.source_type <> 'financeiro')
      AND (coalesce(settings.monitoring_show_communication, true)
        OR alert.source_type <> 'comunicacao')
      AND (coalesce(settings.monitoring_show_documents, true)
        OR alert.source_type <> 'documento')
  ), recipients AS (
    SELECT alert.*, alert.recipient_id AS user_id
    FROM eligible_alerts AS alert
    WHERE alert.recipient_id IS NOT NULL

    UNION ALL

    SELECT alert.*, manager.user_id
    FROM eligible_alerts AS alert
    JOIN public.organization_members AS manager
      ON manager.organization_id = alert.organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE alert.recipient_id IS NULL
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    alert.organization_id,
    alert.user_id,
    'Alerta crítico: ' || left(
      coalesce(nullif(trim(alert.title), ''), 'Pendência operacional'), 120
    ),
    left(
      coalesce(nullif(trim(alert.reason), ''), 'Esta pendência exige atenção imediata'),
      450
    ) || '. Verifique esta pendência no monitoramento.',
    'monitoring',
    alert.source_type,
    alert.source_id,
    '/monitoramento',
    'critical-monitoring:' || alert.source_type || ':' || alert.source_id::text ||
      ':' || alert.alert_kind || ':' || alert.episode
  FROM recipients AS alert
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- The clock calls one private cycle. Scheduled actions run first; a failure in
-- the new alert scan is isolated so it cannot roll back task creation or daily
-- summaries that were already processed in the same cycle.
CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scheduled_count integer;
  critical_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    critical_count := public.create_critical_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    critical_count := -1;
    RAISE WARNING 'CRITICAL_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_critical_monitoring_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_critical_monitoring_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;

DO $scheduler$
DECLARE
  existing_job record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'SCHEDULER_REQUIRES_POSTGRES';
  END IF;

  IF to_regprocedure('public.run_temporal_automation_cycle()') IS NULL
     OR NOT has_function_privilege(
       'postgres', 'public.run_temporal_automation_cycle()', 'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'TEMPORAL_CYCLE_NOT_EXECUTABLE';
  END IF;

  FOR existing_job IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'core-fluxa-process-due-scheduled-automations'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'core-fluxa-process-due-scheduled-automations',
    '*/15 * * * *',
    'SELECT public.run_temporal_automation_cycle();'
  );
END;
$scheduler$;
