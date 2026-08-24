-- Stage 32: complement the existing 30/15/7/1-day document reminders with
-- post-expiration notices. This scan only creates internal notifications and
-- reuses the existing private fifteen-minute clock.

CREATE OR REPLACE FUNCTION public.create_expired_document_notifications()
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
      AND coalesce(settings.monitoring_show_documents, true)
      AND coalesce(
        settings.notification_preferences->>'expiring_documents', 'true'
      ) <> 'false'
  ), expired_documents AS (
    SELECT
      document.organization_id,
      document.id AS document_id,
      document.title,
      document.expiration_date,
      config.preferences,
      (
        (now() AT TIME ZONE config.timezone_name)::date
        - document.expiration_date
      )::integer AS overdue_days
    FROM public.documents AS document
    JOIN organization_config AS config
      ON config.organization_id = document.organization_id
    WHERE document.expiration_date IS NOT NULL
      AND document.archived_at IS NULL
      AND document.status::text <> 'arquivado'
  ), eligible_documents AS (
    SELECT
      document.*,
      CASE
        WHEN document.overdue_days >= 30 THEN 3
        WHEN document.overdue_days >= 7 THEN 2
        ELSE 1
      END AS notice_stage,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = document.organization_id
            AND member.user_id = monitoring_state.assigned_to
            AND member.is_active
        ) THEN monitoring_state.assigned_to
      END AS responsible_id
    FROM expired_documents AS document
    LEFT JOIN public.monitoring_states AS monitoring_state
      ON monitoring_state.organization_id = document.organization_id
     AND monitoring_state.source_type = 'documento'
     AND monitoring_state.source_id = document.document_id
     AND monitoring_state.alert_kind = 'documento_vencido'
    WHERE document.overdue_days >= 1
      AND coalesce(monitoring_state.monitoring_status, 'novo')
        NOT IN ('resolvido', 'ignorado')
      AND NOT (
        coalesce(document.preferences->>'critical_monitoring', 'true')
          <> 'false'
        AND EXISTS (
          SELECT 1
          FROM public.operational_monitoring_alerts AS alert
          WHERE alert.organization_id = document.organization_id
            AND alert.source_type = 'documento'
            AND alert.source_id = document.document_id
            AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
            AND coalesce(alert.priority_override, alert.suggested_priority)
              = 'critica'
        )
      )
  ), recipients AS (
    SELECT document.*, document.responsible_id AS user_id
    FROM eligible_documents AS document
    WHERE document.responsible_id IS NOT NULL

    UNION

    SELECT document.*, manager.user_id
    FROM eligible_documents AS document
    JOIN public.organization_members AS manager
      ON manager.organization_id = document.organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE document.responsible_id IS NULL
       OR document.notice_stage >= 2
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    document.organization_id,
    document.user_id,
    CASE document.notice_stage
      WHEN 1 THEN 'Documento vencido: '
      WHEN 2 THEN 'Escalonamento — documento vencido: '
      ELSE 'Alerta prolongado — documento vencido: '
    END || left(
      coalesce(nullif(trim(document.title), ''), 'Documento sem título'),
      110
    ),
    CASE document.notice_stage
      WHEN 1 THEN format(
        'Vencido há %s %s. Providencie a renovação ou atualização do documento.',
        document.overdue_days,
        CASE WHEN document.overdue_days = 1 THEN 'dia' ELSE 'dias' END
      )
      WHEN 2 THEN format(
        'Vencido há %s dias. O responsável e a gestão foram avisados.',
        document.overdue_days
      )
      ELSE format(
        'Vencido há %s dias. A pendência continua ativa e exige regularização.',
        document.overdue_days
      )
    END,
    'document',
    'documento',
    document.document_id,
    '/documentos',
    'expired-document:' || document.document_id::text || ':' ||
      document.expiration_date::text || ':' ||
      document.notice_stage::text || ':' || document.user_id::text
  FROM recipients AS document
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Preserve every existing temporal scan and isolate this new category. No
-- additional pg_cron job is created by this migration.
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
  expired_document_count integer := 0;
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

  BEGIN
    expired_document_count :=
      public.create_expired_document_notifications();
  EXCEPTION WHEN OTHERS THEN
    expired_document_count := -1;
    RAISE WARNING 'EXPIRED_DOCUMENT_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count,
    'expired_document_notifications_created', expired_document_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_expired_document_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_expired_document_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
