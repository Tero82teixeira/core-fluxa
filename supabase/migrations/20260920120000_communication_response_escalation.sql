-- Configurable response reminders, management escalation and a privacy-safe
-- overview of push readiness for the internal team.

CREATE TABLE public.communication_response_alert_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_reminder_minutes integer NOT NULL DEFAULT 15
    CHECK (first_reminder_minutes BETWEEN 5 AND 720),
  escalation_minutes integer NOT NULL DEFAULT 30
    CHECK (escalation_minutes BETWEEN 10 AND 1440),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (escalation_minutes > first_reminder_minutes)
);

CREATE TRIGGER communication_response_alert_settings_updated_at
  BEFORE UPDATE ON public.communication_response_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.communication_response_alert_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.communication_response_alert_settings
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_communication_response_alert_settings(
  _organization_id uuid
)
RETURNS TABLE(first_reminder_minutes integer, escalation_minutes integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  RETURN QUERY
  SELECT
    coalesce(settings.first_reminder_minutes, 15),
    coalesce(settings.escalation_minutes, 30)
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.communication_response_alert_settings AS settings
    ON settings.organization_id = _organization_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_communication_response_alert_settings(
  _organization_id uuid,
  _first_reminder_minutes integer,
  _escalation_minutes integer
)
RETURNS TABLE(first_reminder_minutes integer, escalation_minutes integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'COMMUNICATION_ALERT_SETTINGS_PERMISSION_DENIED';
  END IF;
  IF _first_reminder_minutes NOT BETWEEN 5 AND 720
     OR _escalation_minutes NOT BETWEEN 10 AND 1440
     OR _escalation_minutes <= _first_reminder_minutes THEN
    RAISE EXCEPTION 'COMMUNICATION_ALERT_SETTINGS_INVALID';
  END IF;

  INSERT INTO public.communication_response_alert_settings(
    organization_id, first_reminder_minutes, escalation_minutes, updated_by
  ) VALUES (
    _organization_id, _first_reminder_minutes, _escalation_minutes, auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    first_reminder_minutes = EXCLUDED.first_reminder_minutes,
    escalation_minutes = EXCLUDED.escalation_minutes,
    updated_by = auth.uid();

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id,
    auth.uid(),
    'communication.response_alert_settings.updated',
    'organization',
    _organization_id,
    jsonb_build_object(
      'first_reminder_minutes', _first_reminder_minutes,
      'escalation_minutes', _escalation_minutes
    )
  );

  RETURN QUERY SELECT _first_reminder_minutes, _escalation_minutes;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_team_push_status(_organization_id uuid)
RETURNS TABLE(
  user_id uuid,
  active_device_count bigint,
  ever_registered boolean,
  last_activated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'TEAM_PUSH_STATUS_PERMISSION_DENIED';
  END IF;
  RETURN QUERY
  SELECT
    member.user_id,
    count(subscription.id) FILTER (WHERE subscription.is_active),
    count(subscription.id) > 0,
    max(subscription.updated_at)
  FROM public.organization_members AS member
  LEFT JOIN public.push_subscriptions AS subscription
    ON subscription.organization_id = member.organization_id
   AND subscription.user_id = member.user_id
  WHERE member.organization_id = _organization_id
  GROUP BY member.user_id
  ORDER BY member.user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remind_member_push_activation(
  _organization_id uuid,
  _member_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'TEAM_PUSH_REMINDER_PERMISSION_DENIED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members AS member
    WHERE member.organization_id = _organization_id
      AND member.user_id = _member_user_id
      AND member.is_active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_MEMBER_NOT_FOUND';
  END IF;

  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  ) VALUES (
    _organization_id,
    _member_user_id,
    'Ative os alertas de atendimento',
    'A gestão solicita que você ative as notificações neste aparelho para acompanhar novas mensagens de clientes.',
    'team',
    'member',
    _member_user_id,
    '/notificacoes',
    'push-activation-reminder:' || _member_user_id::text || ':' || current_date::text
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count > 0;
END;
$function$;

-- Replace the fixed priority windows with the organization's two response
-- stages. A newer public staff reply or a status change makes the thread
-- ineligible, so reminders stop without a separate cancellation job.
CREATE OR REPLACE FUNCTION public.create_portal_sla_notifications(
  _as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  created_count integer := 0;
BEGIN
  WITH organization_config AS (
    SELECT
      organization.id AS organization_id,
      coalesce(alerts.first_reminder_minutes, 15) AS first_reminder_minutes,
      coalesce(alerts.escalation_minutes, 30) AS escalation_minutes
    FROM public.organizations AS organization
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = organization.id
    LEFT JOIN public.communication_response_alert_settings AS alerts
      ON alerts.organization_id = organization.id
    WHERE organization.archived_at IS NULL
      AND coalesce(settings.monitoring_show_communication, true)
      AND coalesce(
        settings.notification_preferences->>'portal_sla_alerts', 'true'
      ) <> 'false'
  ), waiting_threads AS (
    SELECT
      thread.organization_id,
      thread.id AS thread_id,
      thread.subject,
      thread.assigned_to,
      client.name AS client_name,
      last_message.occurred_at AS waiting_since,
      last_message.occurred_at + make_interval(
        mins => config.first_reminder_minutes
      ) AS reminder_at,
      last_message.occurred_at + make_interval(
        mins => config.escalation_minutes
      ) AS escalation_at
    FROM public.communication_threads AS thread
    JOIN organization_config AS config
      ON config.organization_id = thread.organization_id
    JOIN public.client_portal_communication_shares AS share
      ON share.organization_id = thread.organization_id
     AND share.client_id = thread.client_id
     AND share.thread_id = thread.id
     AND share.is_shared
    JOIN public.clients AS client
      ON client.organization_id = thread.organization_id
     AND client.id = thread.client_id
     AND client.archived_at IS NULL
    JOIN LATERAL (
      SELECT entry.occurred_at, entry.metadata->>'source' AS source
      FROM public.communication_entries AS entry
      WHERE entry.organization_id = thread.organization_id
        AND entry.thread_id = thread.id
        AND entry.entry_type::text = 'mensagem'
        AND NOT entry.is_internal
      ORDER BY entry.occurred_at DESC, entry.created_at DESC, entry.id DESC
      LIMIT 1
    ) AS last_message ON last_message.source = 'client_portal'
    WHERE thread.archived_at IS NULL
      AND thread.status::text = 'aguardando_equipe'
  ), eligible_threads AS (
    SELECT
      thread.*,
      CASE WHEN _as_of >= thread.escalation_at THEN 2 ELSE 1 END AS notice_stage,
      CASE WHEN EXISTS (
        SELECT 1 FROM public.organization_members AS member
        WHERE member.organization_id = thread.organization_id
          AND member.user_id = thread.assigned_to
          AND member.is_active
      ) THEN thread.assigned_to END AS responsible_id
    FROM waiting_threads AS thread
    WHERE _as_of >= thread.reminder_at
  ), recipients AS (
    SELECT thread.*, thread.responsible_id AS user_id
    FROM eligible_threads AS thread
    WHERE thread.responsible_id IS NOT NULL

    UNION

    SELECT thread.*, manager.user_id
    FROM eligible_threads AS thread
    JOIN public.organization_members AS manager
      ON manager.organization_id = thread.organization_id
     AND manager.is_active
     AND manager.role::text IN ('superadmin', 'proprietario', 'administrador', 'gestor')
    WHERE thread.responsible_id IS NULL OR thread.notice_stage = 2
  )
  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT
    thread.organization_id,
    thread.user_id,
    CASE thread.notice_stage
      WHEN 1 THEN 'Cliente aguardando resposta: '
      ELSE 'Atendimento escalado: '
    END || left(coalesce(nullif(trim(thread.subject), ''), 'Conversa do portal'), 100),
    CASE thread.notice_stage
      WHEN 1 THEN format(
        'O cliente %s aguarda resposta há aproximadamente %s minutos.',
        thread.client_name,
        greatest(0, floor(extract(epoch FROM (_as_of - thread.waiting_since)) / 60))::integer
      )
      ELSE format(
        'O cliente %s continua sem resposta há aproximadamente %s minutos. A gestão foi avisada.',
        thread.client_name,
        greatest(0, floor(extract(epoch FROM (_as_of - thread.waiting_since)) / 60))::integer
      )
    END,
    'communication',
    'comunicacao',
    thread.thread_id,
    '/comunicacao',
    'portal-sla:' || thread.thread_id::text || ':' ||
      to_char(thread.waiting_since AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US') ||
      ':' || thread.notice_stage::text || ':' || thread.user_id::text
  FROM recipients AS thread
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications AS existing
    WHERE existing.organization_id = thread.organization_id
      AND existing.dedupe_key =
        'portal-sla:' || thread.thread_id::text || ':' ||
        to_char(thread.waiting_since AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US') ||
        ':' || thread.notice_stage::text || ':' || thread.user_id::text
  )
  ORDER BY thread.notice_stage DESC, thread.reminder_at, thread.thread_id, thread.user_id
  LIMIT 200
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_communication_response_alert_settings(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_communication_response_alert_settings(uuid, integer, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_team_push_status(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remind_member_push_activation(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_portal_sla_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_communication_response_alert_settings(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_communication_response_alert_settings(uuid, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_team_push_status(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.remind_member_push_activation(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_portal_sla_notifications(timestamptz)
  TO postgres;
