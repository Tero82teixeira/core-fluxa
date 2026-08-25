-- Stage 42: close the operational day at the configured business-hours end.
-- Existing scheduled daily summaries are enriched and suppress the automatic close,
-- so every organization receives at most one daily operational summary source.

CREATE OR REPLACE FUNCTION public.create_operational_close_for_organization(
  _organization_id uuid,
  _as_of timestamptz,
  _dedupe_prefix text,
  _title_prefix text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  preferences jsonb;
  show_financial boolean := true;
  show_communication boolean := true;
  show_documents boolean := true;
  timezone_name text := 'America/Sao_Paulo';
  local_today date;
  created_count integer := 0;
BEGIN
  IF _organization_id IS NULL
     OR _as_of IS NULL
     OR nullif(trim(_dedupe_prefix), '') IS NULL
     OR _title_prefix NOT IN ('Resumo diário', 'Fechamento do dia') THEN
    RAISE EXCEPTION 'INVALID_OPERATIONAL_CLOSE_CONTEXT';
  END IF;

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_timezone_names AS zone
        WHERE zone.name = settings.timezone
      ) THEN settings.timezone
      ELSE 'America/Sao_Paulo'
    END,
    coalesce(settings.notification_preferences, '{}'::jsonb),
    coalesce(settings.monitoring_show_financial, true),
    coalesce(settings.monitoring_show_communication, true),
    coalesce(settings.monitoring_show_documents, true)
  INTO
    timezone_name, preferences, show_financial,
    show_communication, show_documents
  FROM public.organization_settings AS settings
  WHERE settings.organization_id = _organization_id;

  timezone_name := coalesce(timezone_name, 'America/Sao_Paulo');
  preferences := coalesce(preferences, '{}'::jsonb);
  local_today := (_as_of AT TIME ZONE timezone_name)::date;

  WITH eligible_alerts AS MATERIALIZED (
    SELECT
      alert.source_type,
      alert.alert_kind,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = _organization_id
            AND member.user_id = alert.assigned_to
            AND member.is_active
        ) THEN alert.assigned_to
        WHEN EXISTS (
          SELECT 1
          FROM public.organization_members AS member
          WHERE member.organization_id = _organization_id
            AND member.user_id = alert.responsible_id
            AND member.is_active
        ) THEN alert.responsible_id
      END AS recipient_id
    FROM public.operational_monitoring_alerts AS alert
    WHERE alert.organization_id = _organization_id
      AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
      AND (show_financial OR alert.source_type <> 'financeiro')
      AND (show_communication OR alert.source_type <> 'comunicacao')
      AND (show_documents OR alert.source_type <> 'documento')
      AND (
        (
          coalesce(preferences->>'overdue_tasks', 'true') <> 'false'
          AND alert.alert_kind = 'tarefa_atrasada'
        )
        OR (
          coalesce(preferences->>'stale_processes', 'true') <> 'false'
          AND alert.alert_kind = 'processo_sem_movimentacao'
        )
        OR (
          coalesce(preferences->>'overdue_communications', 'true') <> 'false'
          AND alert.alert_kind = 'retorno_atrasado'
        )
        OR (
          coalesce(preferences->>'overdue_accounts', 'true') <> 'false'
          AND alert.alert_kind = 'financeiro_vencido'
        )
        OR (
          coalesce(preferences->>'expiring_documents', 'true') <> 'false'
          AND alert.alert_kind IN ('documento_vencido', 'documento_vencendo')
        )
        OR (
          coalesce(preferences->>'critical_monitoring', 'true') <> 'false'
          AND coalesce(
            alert.priority_override,
            alert.suggested_priority
          ) = 'critica'
        )
      )
  ), active_members AS (
    SELECT
      member.user_id,
      member.role::text IN (
        'superadmin', 'proprietario', 'administrador'
      ) AS is_manager
    FROM public.organization_members AS member
    WHERE member.organization_id = _organization_id
      AND member.is_active
  ), personal_stats AS (
    SELECT
      member.user_id,
      (
        SELECT count(*)::integer
        FROM public.tasks AS task
        WHERE task.organization_id = _organization_id
          AND task.assignee_id = member.user_id
          AND task.completed_at IS NOT NULL
          AND (
            task.completed_at AT TIME ZONE timezone_name
          )::date = local_today
      ) AS completed_tasks,
      (
        SELECT count(*)::integer
        FROM public.processes AS process
        WHERE process.organization_id = _organization_id
          AND process.owner_id = member.user_id
          AND process.archived_at IS NULL
          AND process.stage::text = 'finalizado'
          AND (
            process.updated_at AT TIME ZONE timezone_name
          )::date = local_today
      ) AS completed_processes,
      count(alert.alert_kind)::integer AS pending,
      count(alert.alert_kind) FILTER (
        WHERE alert.alert_kind IN (
          'tarefa_atrasada', 'retorno_atrasado',
          'financeiro_vencido', 'documento_vencido'
        )
      )::integer AS overdue,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'tarefa'
      )::integer AS pending_tasks,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'processo'
      )::integer AS pending_processes,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'documento'
      )::integer AS pending_documents,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'comunicacao'
      )::integer AS pending_communications,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'financeiro'
      )::integer AS pending_financial,
      0::integer AS unassigned,
      0::integer AS failures
    FROM active_members AS member
    LEFT JOIN eligible_alerts AS alert
      ON alert.recipient_id = member.user_id
    WHERE NOT member.is_manager
    GROUP BY member.user_id
  ), management_totals AS (
    SELECT
      (
        SELECT count(*)::integer
        FROM public.tasks AS task
        WHERE task.organization_id = _organization_id
          AND task.completed_at IS NOT NULL
          AND (
            task.completed_at AT TIME ZONE timezone_name
          )::date = local_today
      ) AS completed_tasks,
      (
        SELECT count(*)::integer
        FROM public.processes AS process
        WHERE process.organization_id = _organization_id
          AND process.archived_at IS NULL
          AND process.stage::text = 'finalizado'
          AND (
            process.updated_at AT TIME ZONE timezone_name
          )::date = local_today
      ) AS completed_processes,
      count(alert.alert_kind)::integer AS pending,
      count(alert.alert_kind) FILTER (
        WHERE alert.alert_kind IN (
          'tarefa_atrasada', 'retorno_atrasado',
          'financeiro_vencido', 'documento_vencido'
        )
      )::integer AS overdue,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'tarefa'
      )::integer AS pending_tasks,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'processo'
      )::integer AS pending_processes,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'documento'
      )::integer AS pending_documents,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'comunicacao'
      )::integer AS pending_communications,
      count(alert.alert_kind) FILTER (
        WHERE alert.source_type = 'financeiro'
      )::integer AS pending_financial,
      count(alert.alert_kind) FILTER (
        WHERE alert.recipient_id IS NULL
      )::integer AS unassigned,
      (
        SELECT count(*)::integer
        FROM public.automation_executions AS execution
        WHERE execution.organization_id = _organization_id
          AND execution.status = 'failed'
          AND (
            execution.started_at AT TIME ZONE timezone_name
          )::date = local_today
      ) AS failures
    FROM eligible_alerts AS alert
  ), management_stats AS (
    SELECT member.user_id, total.*
    FROM active_members AS member
    CROSS JOIN management_totals AS total
    WHERE member.is_manager
  ), summaries AS (
    SELECT * FROM personal_stats
    UNION ALL
    SELECT * FROM management_stats
  ), candidates AS (
    SELECT
      summary.*,
      summary.completed_tasks + summary.completed_processes
        AS completed_total
    FROM summaries AS summary
    WHERE
      summary.completed_tasks + summary.completed_processes
      + summary.pending + summary.failures > 0
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, action_url, dedupe_key
  )
  SELECT
    _organization_id,
    candidate.user_id,
    CASE
      WHEN _title_prefix = 'Resumo diário' THEN format(
        'Resumo diário: %s %s',
        candidate.pending,
        CASE candidate.pending
          WHEN 1 THEN 'pendência'
          ELSE 'pendências'
        END
      )
      ELSE format(
        'Fechamento do dia: %s %s e %s %s',
        candidate.completed_total,
        CASE candidate.completed_total
          WHEN 1 THEN 'concluído'
          ELSE 'concluídos'
        END,
        candidate.pending,
        CASE candidate.pending
          WHEN 1 THEN 'pendência'
          ELSE 'pendências'
        END
      )
    END,
    format(
      'Concluídas: %s tarefas; %s processos. Pendências: %s tarefas, %s processos, %s documentos, %s retornos e %s contas. Vencidos: %s. Falhas automáticas: %s.%s',
      candidate.completed_tasks,
      candidate.completed_processes,
      candidate.pending_tasks,
      candidate.pending_processes,
      candidate.pending_documents,
      candidate.pending_communications,
      candidate.pending_financial,
      candidate.overdue,
      candidate.failures,
      CASE
        WHEN candidate.unassigned = 1
          THEN ' 1 item ainda sem responsável.'
        WHEN candidate.unassigned > 1
          THEN format(
            ' %s itens ainda sem responsável.',
            candidate.unassigned
          )
        ELSE ''
      END
    ),
    'monitoring',
    '/monitoramento',
    _dedupe_prefix || ':' || candidate.user_id::text
  FROM candidates AS candidate
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
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
SET search_path = pg_catalog, public, pg_temp
AS $$
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

  RETURN public.create_operational_close_for_organization(
    _organization_id,
    _scheduled_for,
    'operational-summary:' || _automation_schedule_id::text || ':' ||
      _scheduled_for::text,
    'Resumo diário'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_daily_operational_close_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  organization_config record;
  created_count integer := 0;
BEGIN
  FOR organization_config IN
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
        settings.business_hours_end,
        time '18:00'
      ) AS business_hours_end
    FROM public.organizations AS organization
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    WHERE organization.archived_at IS NULL
      AND coalesce(
        settings.notification_preferences
          ->>'daily_operational_close',
        'true'
      ) <> 'false'
      AND NOT EXISTS (
        SELECT 1
        FROM public.automation_schedules AS schedule
        JOIN public.automation_rules AS rule
          ON rule.id = schedule.automation_rule_id
         AND rule.organization_id = schedule.organization_id
        WHERE schedule.organization_id = organization.id
          AND schedule.is_active
          AND rule.is_active
          AND rule.archived_at IS NULL
          AND rule.trigger_type = 'scheduled'
          AND rule.action_type = 'send_operational_summary'
      )
    ORDER BY organization.id
    LIMIT 100
  LOOP
    IF (
      _as_of AT TIME ZONE organization_config.timezone_name
    )::time >= organization_config.business_hours_end THEN
      created_count := created_count
        + public.create_operational_close_for_organization(
          organization_config.organization_id,
          _as_of,
          'operational-close:' ||
            (
              _as_of AT TIME ZONE organization_config.timezone_name
            )::date::text,
          'Fechamento do dia'
        );
    END IF;
  END LOOP;

  RETURN created_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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
  overdue_financial_count integer := 0;
  financial_recurrence_count integer := 0;
  weekly_financial_summary_count integer := 0;
  weekly_data_quality_count integer := 0;
  stale_client_count integer := 0;
  client_birthday_count integer := 0;
  stale_lead_count integer := 0;
  stale_task_count integer := 0;
  daily_operational_close_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    daily_operational_close_count :=
      public.create_daily_operational_close_notifications();
  EXCEPTION WHEN OTHERS THEN
    daily_operational_close_count := -1;
    RAISE WARNING 'DAILY_OPERATIONAL_CLOSE_FAILED: %', SQLSTATE;
  END;

  BEGIN
    financial_recurrence_count :=
      public.process_due_financial_recurrences();
  EXCEPTION WHEN OTHERS THEN
    financial_recurrence_count := -1;
    RAISE WARNING 'FINANCIAL_RECURRENCE_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_financial_summary_count :=
      public.create_weekly_financial_summary_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_financial_summary_count := -1;
    RAISE WARNING 'WEEKLY_FINANCIAL_SUMMARY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_data_quality_count :=
      public.create_weekly_data_quality_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_data_quality_count := -1;
    RAISE WARNING 'WEEKLY_DATA_QUALITY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_client_count := public.create_stale_client_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_client_count := -1;
    RAISE WARNING 'STALE_CLIENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    client_birthday_count :=
      public.create_client_birthday_notifications();
  EXCEPTION WHEN OTHERS THEN
    client_birthday_count := -1;
    RAISE WARNING 'CLIENT_BIRTHDAY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_lead_count := public.create_stale_lead_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_lead_count := -1;
    RAISE WARNING 'STALE_LEAD_SCAN_FAILED: %', SQLSTATE;
  END;

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
    stale_task_count := public.create_stale_task_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_task_count := -1;
    RAISE WARNING 'STALE_TASK_SCAN_FAILED: %', SQLSTATE;
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

  BEGIN
    overdue_financial_count :=
      public.create_overdue_financial_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_financial_count := -1;
    RAISE WARNING 'OVERDUE_FINANCIAL_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'daily_operational_close_notifications_created',
      daily_operational_close_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_task_notifications_created', stale_task_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created',
      financial_recurrence_count,
    'weekly_financial_summaries_created',
      weekly_financial_summary_count,
    'weekly_data_quality_notifications_created',
      weekly_data_quality_count,
    'stale_client_notifications_created', stale_client_count,
    'client_birthday_notifications_created', client_birthday_count,
    'stale_lead_notifications_created', stale_lead_count
  );
END;
$$;


REVOKE ALL ON FUNCTION public.create_operational_close_for_organization(
  uuid, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_operational_summary_notifications(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_daily_operational_close_notifications(
  timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_operational_close_for_organization(
  uuid, timestamptz, text, text
) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_operational_summary_notifications(
  uuid, uuid, timestamptz
) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_daily_operational_close_notifications(
  timestamptz
) TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
