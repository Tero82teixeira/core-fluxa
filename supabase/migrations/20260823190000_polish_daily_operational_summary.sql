-- Stage 25 follow-up: render daily summary notifications with correct Portuguese
-- singular and plural forms. Recipient selection, tenant isolation and deduplication
-- remain unchanged from the approved daily summary implementation.

CREATE OR REPLACE FUNCTION public.create_operational_summary_notifications(
  _organization_id uuid,
  _automation_schedule_id uuid,
  _scheduled_for timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preferences jsonb;
  show_financial boolean;
  show_communication boolean;
  show_documents boolean;
  created_count integer := 0;
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

  SELECT
    coalesce(settings.notification_preferences, '{
      "overdue_tasks":true,
      "stale_processes":true,
      "overdue_communications":true,
      "overdue_accounts":true,
      "expiring_documents":true,
      "critical_monitoring":true
    }'::jsonb),
    coalesce(settings.monitoring_show_financial, true),
    coalesce(settings.monitoring_show_communication, true),
    coalesce(settings.monitoring_show_documents, true)
  INTO preferences, show_financial, show_communication, show_documents
  FROM public.organization_settings AS settings
  WHERE settings.organization_id = _organization_id;

  preferences := coalesce(preferences, '{
    "overdue_tasks":true,
    "stale_processes":true,
    "overdue_communications":true,
    "overdue_accounts":true,
    "expiring_documents":true,
    "critical_monitoring":true
  }'::jsonb);
  show_financial := coalesce(show_financial, true);
  show_communication := coalesce(show_communication, true);
  show_documents := coalesce(show_documents, true);

  WITH eligible_alerts AS (
    SELECT
      alert.source_type,
      alert.source_id,
      alert.alert_kind,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.organization_members AS member
          WHERE member.organization_id = _organization_id
            AND member.user_id = alert.assigned_to AND member.is_active
        ) THEN alert.assigned_to
        WHEN EXISTS (
          SELECT 1 FROM public.organization_members AS member
          WHERE member.organization_id = _organization_id
            AND member.user_id = alert.responsible_id AND member.is_active
        ) THEN alert.responsible_id
      END AS recipient_id
    FROM public.operational_monitoring_alerts AS alert
    WHERE alert.organization_id = _organization_id
      AND alert.monitoring_status NOT IN ('resolvido', 'ignorado')
      AND (show_financial OR alert.source_type <> 'financeiro')
      AND (show_communication OR alert.source_type <> 'comunicacao')
      AND (show_documents OR alert.source_type <> 'documento')
      AND (
        ((preferences->>'overdue_tasks') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'tarefa_atrasada')
        OR ((preferences->>'stale_processes') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'processo_sem_movimentacao')
        OR ((preferences->>'overdue_communications') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'retorno_atrasado')
        OR ((preferences->>'overdue_accounts') IS DISTINCT FROM 'false'
          AND alert.alert_kind = 'financeiro_vencido')
        OR ((preferences->>'expiring_documents') IS DISTINCT FROM 'false'
          AND alert.alert_kind IN ('documento_vencido', 'documento_vencendo'))
        OR ((preferences->>'critical_monitoring') IS DISTINCT FROM 'false'
          AND coalesce(alert.priority_override, alert.suggested_priority) = 'critica')
      )
  ), recipient_alerts AS (
    SELECT alert.recipient_id, alert.source_type, false AS is_unassigned
    FROM eligible_alerts AS alert
    WHERE alert.recipient_id IS NOT NULL
    UNION ALL
    SELECT manager.user_id, alert.source_type, true
    FROM eligible_alerts AS alert
    JOIN public.organization_members AS manager
      ON manager.organization_id = _organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador')
    WHERE alert.recipient_id IS NULL
  ), summaries AS (
    SELECT
      recipient_id,
      count(*)::integer AS total,
      count(*) FILTER (WHERE source_type = 'tarefa')::integer AS tasks,
      count(*) FILTER (WHERE source_type = 'processo')::integer AS processes,
      count(*) FILTER (WHERE source_type = 'documento')::integer AS documents,
      count(*) FILTER (WHERE source_type = 'comunicacao')::integer AS communications,
      count(*) FILTER (WHERE source_type = 'financeiro')::integer AS financial,
      count(*) FILTER (WHERE is_unassigned)::integer AS unassigned
    FROM recipient_alerts
    GROUP BY recipient_id
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, action_url, dedupe_key
  )
  SELECT
    _organization_id,
    summary.recipient_id,
    format(
      'Resumo diário: %s %s',
      summary.total,
      CASE WHEN summary.total = 1 THEN 'pendência' ELSE 'pendências' END
    ),
    format(
      '%s %s, %s %s, %s %s, %s %s e %s %s.%s',
      summary.tasks, CASE WHEN summary.tasks = 1 THEN 'tarefa' ELSE 'tarefas' END,
      summary.processes, CASE WHEN summary.processes = 1 THEN 'processo' ELSE 'processos' END,
      summary.documents, CASE WHEN summary.documents = 1 THEN 'documento' ELSE 'documentos' END,
      summary.communications, CASE WHEN summary.communications = 1 THEN 'retorno' ELSE 'retornos' END,
      summary.financial, CASE WHEN summary.financial = 1 THEN 'conta' ELSE 'contas' END,
      CASE
        WHEN summary.unassigned = 1 THEN ' 1 item ainda sem responsável.'
        WHEN summary.unassigned > 1
          THEN format(' %s itens ainda sem responsável.', summary.unassigned)
        ELSE ''
      END
    ),
    'monitoring',
    '/monitoramento',
    'operational-summary:' || _automation_schedule_id::text || ':' ||
      _scheduled_for::text || ':' || summary.recipient_id::text
  FROM summaries AS summary
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_operational_summary_notifications(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_operational_summary_notifications(
  uuid, uuid, timestamptz
) TO postgres;
