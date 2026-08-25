-- Stage 41: notify active assignees when open, non-overdue tasks remain
-- without a real update, and escalate after a second configurable interval.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS stale_task_days integer DEFAULT 5;

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_stale_task_days_check;
ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_stale_task_days_check
  CHECK (stale_task_days IS NULL OR stale_task_days BETWEEN 1 AND 90);

CREATE INDEX IF NOT EXISTS tasks_stale_activity_idx
  ON public.tasks(organization_id, updated_at)
  WHERE archived_at IS NULL
    AND deleted_at IS NULL
    AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_organization_settings(_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(_organization_id) THEN RAISE EXCEPTION 'SETTINGS_ORGANIZATION_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'organization_id',o.id,'legal_name',o.legal_name,'trade_name',o.trade_name,'document',o.document,'email',o.email,'phone',o.phone,'website',o.website,
    'created_at',o.created_at,'zip_code',s.zip_code,'street',s.street,'number',s.number,'complement',s.complement,'district',s.district,'city',s.city,'state',s.state,
    'timezone',COALESCE(s.timezone,'America/Sao_Paulo'),'locale',COALESCE(s.locale,'pt-BR'),'date_format',COALESCE(s.date_format,'dd/MM/yyyy'),'currency',COALESCE(s.currency,'BRL'),
    'week_starts_on',COALESCE(s.week_starts_on,1),'business_hours_start',COALESCE(to_char(s.business_hours_start,'HH24:MI'),'08:00'),'business_hours_end',COALESCE(to_char(s.business_hours_end,'HH24:MI'),'18:00'),
    'default_task_due_days',COALESCE(s.default_task_due_days,7),'default_task_priority',COALESCE(s.default_task_priority,'media'),'stale_task_days',COALESCE(s.stale_task_days,5),'stale_process_days',COALESCE(s.stale_process_days,14),
    'default_responsible_id',s.default_responsible_id,'allow_overdue_task_without_reason',COALESCE(s.allow_overdue_task_without_reason,false),
    'default_financial_account_id',s.default_financial_account_id,'default_income_category_id',s.default_income_category_id,'default_expense_category_id',s.default_expense_category_id,
    'financial_alert_days',COALESCE(s.financial_alert_days,7),'monitoring_financial_high_threshold',COALESCE(s.monitoring_financial_high_threshold,10000),'monitoring_financial_critical_threshold',COALESCE(s.monitoring_financial_critical_threshold,50000),
    'default_communication_channel',COALESCE(s.default_communication_channel,'interno'),'default_communication_priority',COALESCE(s.default_communication_priority,'normal'),'default_follow_up_hours',COALESCE(s.default_follow_up_hours,24),'highlight_internal_notes',COALESCE(s.highlight_internal_notes,true),
    'monitoring_upcoming_days',COALESCE(s.monitoring_upcoming_days,7),'monitoring_document_expiration_days',COALESCE(s.monitoring_document_expiration_days,30),
    'monitoring_show_financial',COALESCE(s.monitoring_show_financial,true),'monitoring_show_communication',COALESCE(s.monitoring_show_communication,true),'monitoring_show_documents',COALESCE(s.monitoring_show_documents,true),
    'notification_preferences',COALESCE(s.notification_preferences,'{"overdue_tasks":true,"stale_processes":true,"overdue_communications":true,"overdue_accounts":true,"expiring_documents":true,"critical_monitoring":true}'::jsonb),
    'updated_at',s.updated_at,'member_count',(SELECT count(*) FROM organization_members m WHERE m.organization_id=o.id AND m.is_active),
    'client_count',(SELECT count(*) FROM clients c WHERE c.organization_id=o.id AND c.archived_at IS NULL),
    'active_process_count',(SELECT count(*) FROM processes p WHERE p.organization_id=o.id AND p.archived_at IS NULL AND p.stage NOT IN ('finalizado','arquivado','cancelado')),
    'recent_audit',COALESCE((SELECT jsonb_agg(x) FROM (SELECT a.id,a.action,a.metadata,a.created_at,a.actor_name FROM audit_logs a WHERE a.organization_id=o.id AND a.entity='organization_settings' ORDER BY a.created_at DESC LIMIT 10) x),'[]'::jsonb)
  ) INTO result FROM organizations o LEFT JOIN organization_settings s ON s.organization_id=o.id WHERE o.id=_organization_id;
  IF result IS NULL THEN RAISE EXCEPTION 'SETTINGS_ORGANIZATION_NOT_FOUND'; END IF; RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.update_organization_settings(_organization_id uuid,_changes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_data jsonb; new_data jsonb; key text; old_value jsonb; new_value jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(_organization_id,ARRAY['superadmin','proprietario','administrador']::public.app_role[]) THEN RAISE EXCEPTION 'SETTINGS_WRITE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_changes)<>'object' THEN RAISE EXCEPTION 'SETTINGS_INVALID_PAYLOAD'; END IF;
  IF COALESCE((_changes->>'stale_task_days')::integer,5) NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'SETTINGS_STALE_TASK_DAYS_INVALID'; END IF;
  old_data:=public.get_organization_settings(_organization_id);
  IF COALESCE(_changes->>'timezone',old_data->>'timezone') NOT IN ('America/Sao_Paulo','America/Manaus','America/Fortaleza','America/Recife','America/Bahia','America/Belem','America/Cuiaba','America/Porto_Velho','America/Rio_Branco','UTC') THEN RAISE EXCEPTION 'SETTINGS_TIMEZONE_INVALID'; END IF;
  IF COALESCE(_changes->>'locale',old_data->>'locale') NOT IN ('pt-BR','en-US','es-ES') THEN RAISE EXCEPTION 'SETTINGS_LOCALE_INVALID'; END IF;
  IF COALESCE(_changes->>'currency',old_data->>'currency') NOT IN ('BRL','USD','EUR') THEN RAISE EXCEPTION 'SETTINGS_CURRENCY_INVALID'; END IF;
  IF COALESCE(_changes->>'default_communication_channel',old_data->>'default_communication_channel') NOT IN ('whatsapp','telefone','email','presencial','interno','outro') THEN RAISE EXCEPTION 'SETTINGS_COMMUNICATION_CHANNEL_INVALID'; END IF;
  IF COALESCE(_changes->>'default_communication_priority',old_data->>'default_communication_priority') NOT IN ('baixa','normal','alta','urgente') THEN RAISE EXCEPTION 'SETTINGS_COMMUNICATION_PRIORITY_INVALID'; END IF;
  IF COALESCE((_changes->>'monitoring_financial_critical_threshold')::numeric,(old_data->>'monitoring_financial_critical_threshold')::numeric) <= COALESCE((_changes->>'monitoring_financial_high_threshold')::numeric,(old_data->>'monitoring_financial_high_threshold')::numeric) THEN RAISE EXCEPTION 'SETTINGS_CRITICAL_THRESHOLD_MUST_EXCEED_HIGH'; END IF;
  IF NULLIF(_changes->>'default_responsible_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=_organization_id AND user_id=NULLIF(_changes->>'default_responsible_id','')::uuid AND is_active) THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  IF NULLIF(_changes->>'default_financial_account_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_accounts WHERE organization_id=_organization_id AND id=NULLIF(_changes->>'default_financial_account_id','')::uuid) THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  IF NULLIF(_changes->>'default_income_category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_categories WHERE organization_id=_organization_id AND id=NULLIF(_changes->>'default_income_category_id','')::uuid AND type='income') THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  IF NULLIF(_changes->>'default_expense_category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_categories WHERE organization_id=_organization_id AND id=NULLIF(_changes->>'default_expense_category_id','')::uuid AND type='expense') THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  UPDATE organizations SET legal_name=COALESCE(NULLIF(trim(_changes->>'legal_name'),''),legal_name),trade_name=CASE WHEN _changes?'trade_name' THEN NULLIF(trim(_changes->>'trade_name'),'') ELSE trade_name END,email=CASE WHEN _changes?'email' THEN NULLIF(trim(_changes->>'email'),'') ELSE email END,phone=CASE WHEN _changes?'phone' THEN NULLIF(trim(_changes->>'phone'),'') ELSE phone END,website=CASE WHEN _changes?'website' THEN NULLIF(trim(_changes->>'website'),'') ELSE website END,updated_at=now() WHERE id=_organization_id;
  INSERT INTO organization_settings(organization_id,updated_by) VALUES(_organization_id,auth.uid()) ON CONFLICT(organization_id) DO NOTHING;
  UPDATE organization_settings s SET
    zip_code=CASE WHEN _changes?'zip_code' THEN NULLIF(trim(_changes->>'zip_code'),'') ELSE s.zip_code END,street=CASE WHEN _changes?'street' THEN NULLIF(trim(_changes->>'street'),'') ELSE s.street END,number=CASE WHEN _changes?'number' THEN NULLIF(trim(_changes->>'number'),'') ELSE s.number END,complement=CASE WHEN _changes?'complement' THEN NULLIF(trim(_changes->>'complement'),'') ELSE s.complement END,district=CASE WHEN _changes?'district' THEN NULLIF(trim(_changes->>'district'),'') ELSE s.district END,city=CASE WHEN _changes?'city' THEN NULLIF(trim(_changes->>'city'),'') ELSE s.city END,state=CASE WHEN _changes?'state' THEN NULLIF(trim(_changes->>'state'),'') ELSE s.state END,
    timezone=COALESCE(_changes->>'timezone',s.timezone),locale=COALESCE(_changes->>'locale',s.locale),date_format=COALESCE(_changes->>'date_format',s.date_format),currency=COALESCE(_changes->>'currency',s.currency),week_starts_on=COALESCE((_changes->>'week_starts_on')::smallint,s.week_starts_on),business_hours_start=COALESCE((_changes->>'business_hours_start')::time,s.business_hours_start),business_hours_end=COALESCE((_changes->>'business_hours_end')::time,s.business_hours_end),
    default_task_due_days=COALESCE((_changes->>'default_task_due_days')::int,s.default_task_due_days),default_task_priority=COALESCE((_changes->>'default_task_priority')::priority_level,s.default_task_priority),stale_task_days=COALESCE((_changes->>'stale_task_days')::int,s.stale_task_days),stale_process_days=COALESCE((_changes->>'stale_process_days')::int,s.stale_process_days),default_responsible_id=CASE WHEN _changes?'default_responsible_id' THEN NULLIF(_changes->>'default_responsible_id','')::uuid ELSE s.default_responsible_id END,allow_overdue_task_without_reason=COALESCE((_changes->>'allow_overdue_task_without_reason')::boolean,s.allow_overdue_task_without_reason),
    default_financial_account_id=CASE WHEN _changes?'default_financial_account_id' THEN NULLIF(_changes->>'default_financial_account_id','')::uuid ELSE s.default_financial_account_id END,default_income_category_id=CASE WHEN _changes?'default_income_category_id' THEN NULLIF(_changes->>'default_income_category_id','')::uuid ELSE s.default_income_category_id END,default_expense_category_id=CASE WHEN _changes?'default_expense_category_id' THEN NULLIF(_changes->>'default_expense_category_id','')::uuid ELSE s.default_expense_category_id END,financial_alert_days=COALESCE((_changes->>'financial_alert_days')::int,s.financial_alert_days),monitoring_financial_high_threshold=COALESCE((_changes->>'monitoring_financial_high_threshold')::numeric,s.monitoring_financial_high_threshold),monitoring_financial_critical_threshold=COALESCE((_changes->>'monitoring_financial_critical_threshold')::numeric,s.monitoring_financial_critical_threshold),
    default_communication_channel=COALESCE((_changes->>'default_communication_channel')::public.communication_channel,s.default_communication_channel),default_communication_priority=COALESCE((_changes->>'default_communication_priority')::public.communication_priority,s.default_communication_priority),default_follow_up_hours=COALESCE((_changes->>'default_follow_up_hours')::int,s.default_follow_up_hours),highlight_internal_notes=COALESCE((_changes->>'highlight_internal_notes')::boolean,s.highlight_internal_notes),monitoring_upcoming_days=COALESCE((_changes->>'monitoring_upcoming_days')::int,s.monitoring_upcoming_days),monitoring_document_expiration_days=COALESCE((_changes->>'monitoring_document_expiration_days')::int,s.monitoring_document_expiration_days),monitoring_show_financial=COALESCE((_changes->>'monitoring_show_financial')::boolean,s.monitoring_show_financial),monitoring_show_communication=COALESCE((_changes->>'monitoring_show_communication')::boolean,s.monitoring_show_communication),monitoring_show_documents=COALESCE((_changes->>'monitoring_show_documents')::boolean,s.monitoring_show_documents),notification_preferences=COALESCE(_changes->'notification_preferences',s.notification_preferences),updated_by=auth.uid(),updated_at=now() WHERE s.organization_id=_organization_id;
  new_data:=public.get_organization_settings(_organization_id);
  FOR key, new_value IN SELECT * FROM jsonb_each(_changes) LOOP old_value:=old_data->key; IF old_value IS DISTINCT FROM new_value THEN INSERT INTO audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'settings.updated','organization_settings',_organization_id,jsonb_build_object('key',key,'old_value',old_value,'new_value',new_value)); END IF; END LOOP;
  RETURN new_data;
END $$;

CREATE OR REPLACE FUNCTION public.create_stale_task_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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
      greatest(1, least(coalesce(settings.stale_task_days, 5), 90))
        AS stale_task_days
    FROM public.organizations AS organization
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    WHERE organization.archived_at IS NULL
      AND coalesce(
        settings.notification_preferences->>'stale_tasks', 'true'
      ) <> 'false'
  ), configured_organizations AS (
    SELECT
      config.*,
      (_as_of AT TIME ZONE config.timezone_name)::date AS local_today,
      (_as_of AT TIME ZONE config.timezone_name)::time AS local_time
    FROM organization_config AS config
  ), task_activity AS (
    SELECT
      task.organization_id,
      task.id AS task_id,
      task.title,
      task.assignee_id,
      config.stale_task_days,
      config.local_today,
      greatest(
        task.updated_at,
        coalesce(history.last_history_at, task.created_at),
        coalesce(comment.last_comment_at, task.created_at)
      ) AS last_activity_at
    FROM public.tasks AS task
    JOIN configured_organizations AS config
      ON config.organization_id = task.organization_id
    JOIN public.organization_members AS active_assignee
      ON active_assignee.organization_id = task.organization_id
     AND active_assignee.user_id = task.assignee_id
     AND active_assignee.is_active
    LEFT JOIN LATERAL (
      SELECT max(entry.created_at) AS last_history_at
      FROM public.task_history AS entry
      WHERE entry.organization_id = task.organization_id
        AND entry.task_id = task.id
    ) AS history ON true
    LEFT JOIN LATERAL (
      SELECT max(greatest(entry.created_at, entry.updated_at))
        AS last_comment_at
      FROM public.task_comments AS entry
      WHERE entry.organization_id = task.organization_id
        AND entry.task_id = task.id
        AND entry.archived_at IS NULL
    ) AS comment ON true
    WHERE task.assignee_id IS NOT NULL
      AND task.archived_at IS NULL
      AND task.deleted_at IS NULL
      AND task.completed_at IS NULL
      AND task.status::text NOT IN ('concluida', 'cancelada', 'arquivada')
      AND config.local_time >= time '08:00'
      AND (
        task.due_at IS NULL
        OR (task.due_at AT TIME ZONE 'UTC')::date >= config.local_today
      )
  ), stale_tasks AS (
    SELECT
      activity.*,
      (
        activity.local_today
        - (
          activity.last_activity_at
          AT TIME ZONE config.timezone_name
        )::date
      )::integer AS inactive_days
    FROM task_activity AS activity
    JOIN configured_organizations AS config
      ON config.organization_id = activity.organization_id
  ), due_tasks AS (
    SELECT
      task.*,
      CASE
        WHEN task.inactive_days >= task.stale_task_days * 2 THEN 2
        ELSE 1
      END AS stage
    FROM stale_tasks AS task
    WHERE task.inactive_days >= task.stale_task_days
  ), owner_recipients AS (
    SELECT task.*, member.user_id
    FROM due_tasks AS task
    JOIN public.organization_members AS member
      ON member.organization_id = task.organization_id
     AND member.user_id = task.assignee_id
     AND member.is_active
  ), management_recipients AS (
    SELECT task.*, manager.user_id
    FROM due_tasks AS task
    JOIN public.organization_members AS manager
      ON manager.organization_id = task.organization_id
     AND manager.is_active
     AND manager.role::text IN (
       'superadmin', 'proprietario', 'administrador'
     )
    WHERE task.stage = 2
  ), recipients AS (
    SELECT * FROM owner_recipients
    UNION
    SELECT * FROM management_recipients
  ), candidates AS (
    SELECT
      recipient.*,
      'stale-task:' || recipient.task_id::text || ':' ||
        to_char(
          recipient.last_activity_at AT TIME ZONE 'UTC',
          'YYYYMMDDHH24MISSUS'
        ) || ':' || recipient.stale_task_days::text || ':' ||
        recipient.stage::text || ':' || recipient.user_id::text
        AS dedupe_key
    FROM recipients AS recipient
  ), pending_candidates AS (
    SELECT candidate.*
    FROM candidates AS candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications AS existing
      WHERE existing.organization_id = candidate.organization_id
        AND existing.user_id = candidate.user_id
        AND existing.dedupe_key = candidate.dedupe_key
    )
    ORDER BY
      candidate.stage DESC,
      candidate.inactive_days DESC,
      candidate.title,
      candidate.task_id,
      candidate.user_id
    LIMIT 200
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    candidate.organization_id,
    candidate.user_id,
    CASE candidate.stage
      WHEN 2 THEN 'Tarefa sem atualização — escalonada: '
      ELSE 'Tarefa sem atualização: '
    END || left(
      coalesce(nullif(trim(candidate.title), ''), 'Tarefa sem título'), 110
    ),
    CASE candidate.stage
      WHEN 2 THEN format(
        'Esta tarefa está sem movimentação há %s dias. O responsável e a gestão foram avisados.',
        candidate.inactive_days
      )
      ELSE format(
        'Esta tarefa está sem movimentação há %s dias. Revise o andamento e registre uma atualização.',
        candidate.inactive_days
      )
    END,
    'task',
    'tarefa',
    candidate.task_id,
    '/tarefas',
    candidate.dedupe_key
  FROM pending_candidates AS candidate
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
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
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

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

REVOKE ALL ON FUNCTION public.create_stale_task_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_stale_task_notifications(timestamptz)
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
