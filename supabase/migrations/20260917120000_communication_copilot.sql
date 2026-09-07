-- Communication Copilot: organization opt-in, least-privilege context and audit trail.
-- The AI provider is called only by an authenticated Edge Function. This RPC never
-- returns internal notes, client profile fields, team identity or financial information.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS communication_ai_enabled boolean
  NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_communication_copilot_settings(
  _organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(_organization_id) THEN
    RAISE EXCEPTION 'COMMUNICATION_COPILOT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'enabled', COALESCE((
      SELECT settings.communication_ai_enabled
        FROM public.organization_settings AS settings
       WHERE settings.organization_id = _organization_id
    ), false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_communication_copilot_settings(
  _organization_id uuid,
  _enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  previous_value boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'COMMUNICATION_COPILOT_SETTINGS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(settings.communication_ai_enabled, false)
    INTO previous_value
    FROM public.organization_settings AS settings
   WHERE settings.organization_id = _organization_id;

  INSERT INTO public.organization_settings (
    organization_id,
    communication_ai_enabled,
    updated_by
  ) VALUES (
    _organization_id,
    COALESCE(_enabled, false),
    auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    communication_ai_enabled = EXCLUDED.communication_ai_enabled,
    updated_by = auth.uid(),
    updated_at = now();

  IF previous_value IS DISTINCT FROM COALESCE(_enabled, false) THEN
    INSERT INTO public.audit_logs (
      organization_id,
      actor_id,
      action,
      entity,
      entity_id,
      metadata
    ) VALUES (
      _organization_id,
      auth.uid(),
      'communication.copilot.settings.updated',
      'organization_settings',
      _organization_id,
      jsonb_build_object(
        'previous_enabled', COALESCE(previous_value, false),
        'enabled', COALESCE(_enabled, false)
      )
    );
  END IF;

  RETURN jsonb_build_object('enabled', COALESCE(_enabled, false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_communication_copilot(
  _thread_id uuid,
  _mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  thread_row public.communication_threads%ROWTYPE;
  process_code text;
  public_entries jsonb;
  hourly_requests integer;
BEGIN
  IF _mode NOT IN ('assist', 'review') THEN
    RAISE EXCEPTION 'COMMUNICATION_COPILOT_MODE_INVALID';
  END IF;

  SELECT thread.*
    INTO thread_row
    FROM public.communication_threads AS thread
   WHERE thread.id = _thread_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMUNICATION_COPILOT_THREAD_NOT_FOUND';
  END IF;

  PERFORM public.communication_assert_role(thread_row.organization_id, false);

  IF NOT COALESCE((
    SELECT settings.communication_ai_enabled
      FROM public.organization_settings AS settings
     WHERE settings.organization_id = thread_row.organization_id
  ), false) THEN
    RAISE EXCEPTION 'COMMUNICATION_COPILOT_DISABLED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer
    INTO hourly_requests
    FROM public.audit_logs AS log
   WHERE log.organization_id = thread_row.organization_id
     AND log.actor_id = auth.uid()
     AND log.action = 'communication.copilot.requested'
     AND log.created_at >= now() - interval '1 hour';

  IF hourly_requests >= 30 THEN
    RAISE EXCEPTION 'COMMUNICATION_COPILOT_RATE_LIMIT';
  END IF;

  IF thread_row.process_id IS NOT NULL THEN
    SELECT process.code
      INTO process_code
      FROM public.processes AS process
     WHERE process.id = thread_row.process_id
       AND process.organization_id = thread_row.organization_id;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'author', item.author_kind,
        'type', item.entry_type,
        'content', item.content,
        'occurred_at', item.occurred_at
      ) ORDER BY item.occurred_at, item.created_at
    ),
    '[]'::jsonb
  )
  INTO public_entries
  FROM (
    SELECT
      CASE
        WHEN entry.metadata->>'source' = 'client_portal' THEN 'cliente'
        ELSE 'empresa'
      END AS author_kind,
      entry.entry_type::text AS entry_type,
      left(entry.content, 2500) AS content,
      entry.occurred_at,
      entry.created_at
    FROM public.communication_entries AS entry
    WHERE entry.thread_id = thread_row.id
      AND entry.organization_id = thread_row.organization_id
      AND NOT entry.is_internal
      AND entry.entry_type::text <> 'nota_interna'
    ORDER BY entry.occurred_at DESC, entry.created_at DESC
    LIMIT 40
  ) AS item;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    thread_row.organization_id,
    auth.uid(),
    'communication.copilot.requested',
    'communication_thread',
    thread_row.id,
    jsonb_build_object('mode', _mode, 'public_entry_count', jsonb_array_length(public_entries))
  );

  RETURN jsonb_build_object(
    'thread', jsonb_build_object(
      'subject', left(thread_row.subject, 240),
      'channel', thread_row.channel::text,
      'status', thread_row.status::text,
      'priority', thread_row.priority::text,
      'process_code', process_code
    ),
    'entries', public_entries
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_communication_copilot_settings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_communication_copilot_settings(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_communication_copilot(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_communication_copilot_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_communication_copilot_settings(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_communication_copilot(uuid, text) TO authenticated;
