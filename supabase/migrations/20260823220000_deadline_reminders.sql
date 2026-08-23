-- Stage 28: internal deadline reminders at 30, 15, 7 and 1 day before due.
-- Civil dates are evaluated in each organization's validated timezone. The
-- private database clock remains unchanged and no external delivery is used.

CREATE OR REPLACE FUNCTION public.create_deadline_reminder_notifications()
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
      END AS timezone_name,
      coalesce(
        settings.notification_preferences->>'deadline_reminders', 'true'
      ) <> 'false' AS reminders_enabled,
      coalesce(settings.monitoring_show_financial, true) AS show_financial,
      coalesce(settings.monitoring_show_documents, true) AS show_documents
    FROM public.organizations AS organization
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    WHERE organization.archived_at IS NULL
  ), configured_organizations AS (
    SELECT
      config.*,
      (now() AT TIME ZONE config.timezone_name)::date AS local_today
    FROM organization_config AS config
    WHERE config.reminders_enabled
  ), deadlines AS (
    SELECT
      task.organization_id,
      'tarefa'::text AS source_type,
      task.id AS source_id,
      task.title,
      'Tarefa'::text AS source_label,
      (task.due_at AT TIME ZONE config.timezone_name)::date AS due_on,
      ((task.due_at AT TIME ZONE config.timezone_name)::date
        - config.local_today)::integer AS days_until,
      task.assignee_id AS responsible_id,
      '/tarefas'::text AS action_url
    FROM public.tasks AS task
    JOIN configured_organizations AS config
      ON config.organization_id = task.organization_id
    WHERE task.due_at IS NOT NULL
      AND task.archived_at IS NULL
      AND task.deleted_at IS NULL
      AND task.completed_at IS NULL
      AND task.status::text NOT IN ('concluida', 'cancelada', 'arquivada')
      AND task.due_at >= (
        (config.local_today + 1)::timestamp AT TIME ZONE config.timezone_name
      )
      AND task.due_at < (
        (config.local_today + 31)::timestamp AT TIME ZONE config.timezone_name
      )
      AND ((task.due_at AT TIME ZONE config.timezone_name)::date
        - config.local_today) = ANY (ARRAY[30, 15, 7, 1])

    UNION ALL

    SELECT
      process.organization_id,
      'processo',
      process.id,
      coalesce(nullif(trim(process.title), ''), process.code),
      'Processo',
      process.due_date,
      (process.due_date - config.local_today)::integer,
      process.owner_id,
      '/processos'
    FROM public.processes AS process
    JOIN configured_organizations AS config
      ON config.organization_id = process.organization_id
    WHERE process.due_date IS NOT NULL
      AND process.archived_at IS NULL
      AND process.stage::text NOT IN ('finalizado', 'arquivado', 'cancelado')
      AND process.due_date BETWEEN config.local_today + 1
        AND config.local_today + 30
      AND (process.due_date - config.local_today) = ANY (ARRAY[30, 15, 7, 1])

    UNION ALL

    SELECT
      document.organization_id,
      'documento',
      document.id,
      document.title,
      'Documento',
      document.expiration_date,
      (document.expiration_date - config.local_today)::integer,
      NULL::uuid,
      '/documentos'
    FROM public.documents AS document
    JOIN configured_organizations AS config
      ON config.organization_id = document.organization_id
    WHERE config.show_documents
      AND document.expiration_date IS NOT NULL
      AND document.archived_at IS NULL
      AND document.expiration_date BETWEEN config.local_today + 1
        AND config.local_today + 30
      AND (document.expiration_date - config.local_today)
        = ANY (ARRAY[30, 15, 7, 1])

    UNION ALL

    SELECT
      financial.organization_id,
      'financeiro',
      financial.id,
      financial.description,
      'Conta',
      financial.due_date,
      (financial.due_date - config.local_today)::integer,
      financial.responsible_user_id,
      '/financeiro'
    FROM public.financial_transactions AS financial
    JOIN configured_organizations AS config
      ON config.organization_id = financial.organization_id
    WHERE config.show_financial
      AND financial.archived_at IS NULL
      AND financial.status IN ('pending', 'partial', 'overdue')
      AND financial.due_date BETWEEN config.local_today + 1
        AND config.local_today + 30
      AND (financial.due_date - config.local_today)
        = ANY (ARRAY[30, 15, 7, 1])
  ), eligible_responsibles AS (
    SELECT deadline.*, member.user_id
    FROM deadlines AS deadline
    JOIN public.organization_members AS member
      ON member.organization_id = deadline.organization_id
     AND member.user_id = deadline.responsible_id
     AND member.is_active
     AND (
       deadline.source_type <> 'financeiro'
       OR member.role::text IN (
         'superadmin', 'proprietario', 'administrador', 'gestor'
       )
     )
  ), recipients AS (
    SELECT responsible.*
    FROM eligible_responsibles AS responsible

    UNION ALL

    SELECT deadline.*, manager.user_id
    FROM deadlines AS deadline
    JOIN public.organization_members AS manager
      ON manager.organization_id = deadline.organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE NOT EXISTS (
      SELECT 1
      FROM eligible_responsibles AS responsible
      WHERE responsible.organization_id = deadline.organization_id
        AND responsible.source_type = deadline.source_type
        AND responsible.source_id = deadline.source_id
    )
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    reminder.organization_id,
    reminder.user_id,
    CASE
      WHEN reminder.days_until = 1 THEN 'Prazo amanhã: '
      ELSE format('Prazo em %s dias: ', reminder.days_until)
    END || left(
      coalesce(nullif(trim(reminder.title), ''), 'Pendência operacional'), 120
    ),
    format(
      '%s vence em %s. Data: %s.',
      reminder.source_label,
      CASE
        WHEN reminder.days_until = 1 THEN '1 dia'
        ELSE format('%s dias', reminder.days_until)
      END,
      to_char(reminder.due_on, 'DD/MM/YYYY')
    ),
    'deadline',
    reminder.source_type,
    reminder.source_id,
    reminder.action_url,
    'deadline-reminder:' || reminder.source_type || ':' ||
      reminder.source_id::text || ':' || reminder.due_on::text || ':' ||
      reminder.days_until::text
  FROM recipients AS reminder
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

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_deadline_reminder_notifications()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_deadline_reminder_notifications()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
