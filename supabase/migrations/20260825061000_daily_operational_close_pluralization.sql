-- Stage 43: correct Portuguese singular/plural agreement in daily close bodies.
-- The function signature, recipients, counts, permissions and dedupe keys are unchanged.

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
  show_financial := coalesce(show_financial, true);
  show_communication := coalesce(show_communication, true);
  show_documents := coalesce(show_documents, true);
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
      'Concluídas: %s %s; %s %s. Pendências: %s %s, %s %s, %s %s, %s %s e %s %s. Vencidos: %s. Falhas automáticas: %s.%s',
      candidate.completed_tasks,
      CASE candidate.completed_tasks
        WHEN 1 THEN 'tarefa'
        ELSE 'tarefas'
      END,
      candidate.completed_processes,
      CASE candidate.completed_processes
        WHEN 1 THEN 'processo'
        ELSE 'processos'
      END,
      candidate.pending_tasks,
      CASE candidate.pending_tasks
        WHEN 1 THEN 'tarefa'
        ELSE 'tarefas'
      END,
      candidate.pending_processes,
      CASE candidate.pending_processes
        WHEN 1 THEN 'processo'
        ELSE 'processos'
      END,
      candidate.pending_documents,
      CASE candidate.pending_documents
        WHEN 1 THEN 'documento'
        ELSE 'documentos'
      END,
      candidate.pending_communications,
      CASE candidate.pending_communications
        WHEN 1 THEN 'retorno'
        ELSE 'retornos'
      END,
      candidate.pending_financial,
      CASE candidate.pending_financial
        WHEN 1 THEN 'conta'
        ELSE 'contas'
      END,
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

REVOKE ALL ON FUNCTION public.create_operational_close_for_organization(
  uuid, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_operational_close_for_organization(
  uuid, timestamptz, text, text
) TO postgres;
