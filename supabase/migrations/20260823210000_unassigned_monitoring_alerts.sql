-- Stage 27: notify active administrators when an operational alert has no
-- active responsible member. The existing private temporal cycle remains the
-- only clock and continues to derive every tenant from database rows.

CREATE OR REPLACE FUNCTION public.create_unassigned_monitoring_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_count integer := 0;
BEGIN
  WITH unassigned_alerts AS (
    SELECT
      alert.organization_id,
      alert.source_type,
      alert.source_id,
      alert.title,
      alert.reason,
      coalesce(
        unassignment.unassigned_at::text,
        alert.relevant_at::text,
        alert.last_movement_at::text,
        'initial'
      ) AS episode
    FROM public.operational_monitoring_alerts AS alert
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = alert.organization_id
    LEFT JOIN public.monitoring_states AS state
      ON state.organization_id = alert.organization_id
     AND state.source_type = alert.source_type
     AND state.source_id = alert.source_id
     AND state.alert_kind = alert.alert_kind
    LEFT JOIN LATERAL (
      SELECT max(history.created_at) AS unassigned_at
      FROM public.monitoring_state_history AS history
      WHERE history.monitoring_state_id = state.id
        AND history.organization_id = alert.organization_id
        AND history.action = 'responsavel_alterado'
        AND history.details->'assigned_to' = 'null'::jsonb
    ) AS unassignment ON true
    WHERE alert.monitoring_status NOT IN ('resolvido', 'ignorado')
      AND coalesce(
        settings.notification_preferences->>'unassigned_monitoring', 'true'
      ) <> 'false'
      AND (coalesce(settings.monitoring_show_financial, true)
        OR alert.source_type <> 'financeiro')
      AND (coalesce(settings.monitoring_show_communication, true)
        OR alert.source_type <> 'comunicacao')
      AND (coalesce(settings.monitoring_show_documents, true)
        OR alert.source_type <> 'documento')
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = alert.organization_id
          AND member.is_active
          AND member.user_id = alert.assigned_to
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = alert.organization_id
          AND member.is_active
          AND member.user_id = alert.responsible_id
      )
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    alert.organization_id,
    manager.user_id,
    'Pendência sem responsável: ' || left(
      coalesce(nullif(trim(alert.title), ''), 'Pendência operacional'), 110
    ),
    left(
      coalesce(nullif(trim(alert.reason), ''), 'Esta pendência precisa de acompanhamento'),
      430
    ) || '. Defina um responsável no monitoramento.',
    'monitoring',
    alert.source_type,
    alert.source_id,
    '/monitoramento',
    'unassigned-monitoring:' || alert.source_type || ':' ||
      alert.source_id::text || ':' || alert.episode
  FROM unassigned_alerts AS alert
  JOIN public.organization_members AS manager
    ON manager.organization_id = alert.organization_id
   AND manager.is_active
   AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Keep each additional scan isolated. A problem in one notification category
-- must not roll back scheduled tasks, summaries or the other alert category.
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

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_unassigned_monitoring_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_unassigned_monitoring_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
