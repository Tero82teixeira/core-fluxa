-- Client Portal, stage 5: secure two-way communication.
-- Internal communication remains authoritative. Only explicitly shared threads
-- and non-internal message entries are projected to the authenticated client.

CREATE UNIQUE INDEX IF NOT EXISTS communication_threads_organization_client_id_key
  ON public.communication_threads(organization_id, client_id, id);

CREATE TABLE public.client_portal_communication_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  opened_by_client boolean NOT NULL DEFAULT false,
  shared_by uuid,
  shared_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_communication_shares_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_communication_shares_thread_fkey
    FOREIGN KEY (organization_id, client_id, thread_id)
    REFERENCES public.communication_threads(organization_id, client_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_communication_shares_key
    UNIQUE (organization_id, client_id, thread_id)
);

CREATE INDEX client_portal_communication_shares_lookup_idx
  ON public.client_portal_communication_shares(organization_id, client_id, is_shared);

ALTER TABLE public.client_portal_communication_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_portal_communication_shares
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_portal_communication_shares TO service_role;

CREATE TRIGGER client_portal_communication_shares_set_updated_at
  BEFORE UPDATE ON public.client_portal_communication_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.client_portal_communication_management(
  _organization_id uuid,
  _client_id uuid
)
RETURNS TABLE(
  thread_id uuid,
  subject text,
  status text,
  is_shared boolean,
  opened_by_client boolean,
  last_public_message_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario','administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.clients client
     WHERE client.organization_id = _organization_id
       AND client.id = _client_id
       AND client.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT
    thread.id,
    thread.subject,
    thread.status::text,
    COALESCE(share.is_shared, false),
    COALESCE(share.opened_by_client, false),
    (
      SELECT max(entry.occurred_at)
        FROM public.communication_entries entry
       WHERE entry.organization_id = thread.organization_id
         AND entry.thread_id = thread.id
         AND entry.entry_type = 'mensagem'
         AND NOT entry.is_internal
    ),
    thread.updated_at
  FROM public.communication_threads thread
  LEFT JOIN public.client_portal_communication_shares share
    ON share.organization_id = thread.organization_id
   AND share.client_id = thread.client_id
   AND share.thread_id = thread.id
  WHERE thread.organization_id = _organization_id
    AND thread.client_id = _client_id
  ORDER BY thread.updated_at DESC, thread.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_client_portal_communication_shared(
  _organization_id uuid,
  _client_id uuid,
  _thread_id uuid,
  _shared boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_subject text;
  v_actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario','administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  SELECT thread.subject
    INTO v_subject
    FROM public.communication_threads thread
   WHERE thread.organization_id = _organization_id
     AND thread.client_id = _client_id
     AND thread.id = _thread_id
     AND (NOT _shared OR thread.archived_at IS NULL);
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND';
  END IF;

  INSERT INTO public.client_portal_communication_shares(
    organization_id, client_id, thread_id, is_shared,
    shared_by, shared_at, revoked_by, revoked_at
  ) VALUES (
    _organization_id, _client_id, _thread_id, _shared,
    CASE WHEN _shared THEN auth.uid() END,
    CASE WHEN _shared THEN now() END,
    CASE WHEN NOT _shared THEN auth.uid() END,
    CASE WHEN NOT _shared THEN now() END
  )
  ON CONFLICT (organization_id, client_id, thread_id) DO UPDATE SET
    is_shared = EXCLUDED.is_shared,
    shared_by = CASE WHEN EXCLUDED.is_shared THEN auth.uid()
                     ELSE client_portal_communication_shares.shared_by END,
    shared_at = CASE WHEN EXCLUDED.is_shared THEN now()
                     ELSE client_portal_communication_shares.shared_at END,
    revoked_by = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE auth.uid() END,
    revoked_at = CASE WHEN EXCLUDED.is_shared THEN NULL ELSE now() END;

  SELECT profile.full_name
    INTO v_actor_name
    FROM public.profiles profile
   WHERE profile.id = auth.uid();
  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id,
    auth.uid(),
    v_actor_name,
    CASE WHEN _shared THEN 'client_portal.communication_shared'
         ELSE 'client_portal.communication_revoked' END,
    'communication_thread',
    _thread_id,
    jsonb_build_object('client_id', _client_id, 'subject', v_subject)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_communication_threads()
RETURNS TABLE(
  access_id uuid,
  thread_id uuid,
  organization_name text,
  client_name text,
  subject text,
  status text,
  last_message text,
  last_message_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    access.id,
    thread.id,
    organization.legal_name,
    client.name,
    thread.subject,
    thread.status::text,
    last_entry.content,
    last_entry.occurred_at,
    thread.updated_at
  FROM public.client_portal_access access
  JOIN public.organizations organization
    ON organization.id = access.organization_id
   AND organization.archived_at IS NULL
  JOIN public.clients client
    ON client.organization_id = access.organization_id
   AND client.id = access.client_id
   AND client.archived_at IS NULL
  JOIN public.client_portal_communication_shares share
    ON share.organization_id = access.organization_id
   AND share.client_id = access.client_id
   AND share.is_shared
  JOIN public.communication_threads thread
    ON thread.organization_id = share.organization_id
   AND thread.client_id = share.client_id
   AND thread.id = share.thread_id
   AND thread.archived_at IS NULL
  LEFT JOIN LATERAL (
    SELECT entry.content, entry.occurred_at
      FROM public.communication_entries entry
     WHERE entry.organization_id = thread.organization_id
       AND entry.thread_id = thread.id
       AND entry.entry_type = 'mensagem'
       AND NOT entry.is_internal
     ORDER BY entry.occurred_at DESC, entry.created_at DESC, entry.id DESC
     LIMIT 1
  ) last_entry ON true
  WHERE access.user_id = auth.uid()
    AND access.is_active
  ORDER BY COALESCE(last_entry.occurred_at, thread.updated_at) DESC, thread.id;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_communication_entries(_thread_id uuid)
RETURNS TABLE(
  entry_id uuid,
  content text,
  author_kind text,
  occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    entry.id,
    entry.content,
    CASE WHEN entry.metadata->>'source' = 'client_portal'
         THEN 'client' ELSE 'company' END,
    entry.occurred_at
  FROM public.client_portal_access access
  JOIN public.client_portal_communication_shares share
    ON share.organization_id = access.organization_id
   AND share.client_id = access.client_id
   AND share.thread_id = _thread_id
   AND share.is_shared
  JOIN public.communication_threads thread
    ON thread.organization_id = share.organization_id
   AND thread.client_id = share.client_id
   AND thread.id = share.thread_id
   AND thread.archived_at IS NULL
  JOIN public.communication_entries entry
    ON entry.organization_id = thread.organization_id
   AND entry.thread_id = thread.id
   AND entry.entry_type = 'mensagem'
   AND NOT entry.is_internal
  WHERE access.user_id = auth.uid()
    AND access.is_active
  ORDER BY entry.occurred_at, entry.created_at, entry.id;
$function$;

CREATE OR REPLACE FUNCTION public.create_client_portal_communication_thread(
  _access_id uuid,
  _subject text,
  _content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_access public.client_portal_access%ROWTYPE;
  v_thread_id uuid;
  v_entry_id uuid;
  v_client_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  SELECT access.*
    INTO v_access
    FROM public.client_portal_access access
    JOIN public.organizations organization
      ON organization.id = access.organization_id
     AND organization.archived_at IS NULL
    JOIN public.clients client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id
     AND client.archived_at IS NULL
   WHERE access.id = _access_id
     AND access.user_id = auth.uid()
     AND access.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(_subject, ''))) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'INVALID_SUBJECT';
  END IF;
  IF char_length(btrim(COALESCE(_content, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE';
  END IF;

  SELECT client.name
    INTO v_client_name
    FROM public.clients client
   WHERE client.organization_id = v_access.organization_id
     AND client.id = v_access.client_id;

  INSERT INTO public.communication_threads(
    organization_id, client_id, subject, channel, status, priority, created_by
  ) VALUES (
    v_access.organization_id, v_access.client_id, btrim(_subject), 'interno',
    'aguardando_equipe', 'normal', auth.uid()
  ) RETURNING id INTO v_thread_id;

  INSERT INTO public.communication_entries(
    organization_id, thread_id, entry_type, content, created_by,
    occurred_at, is_internal, contact_made, metadata
  ) VALUES (
    v_access.organization_id, v_thread_id, 'mensagem', btrim(_content), auth.uid(),
    now(), false, true,
    jsonb_build_object('source', 'client_portal', 'author_kind', 'client')
  ) RETURNING id INTO v_entry_id;

  INSERT INTO public.client_portal_communication_shares(
    organization_id, client_id, thread_id, is_shared, opened_by_client,
    shared_by, shared_at
  ) VALUES (
    v_access.organization_id, v_access.client_id, v_thread_id, true, true,
    auth.uid(), now()
  );

  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    v_access.organization_id, auth.uid(), v_client_name,
    'client_portal.communication_created', 'communication_thread', v_thread_id,
    jsonb_build_object(
      'client_id', v_access.client_id,
      'subject', btrim(_subject),
      'entry_id', v_entry_id
    )
  );
  RETURN v_thread_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_client_portal_communication_entry(
  _thread_id uuid,
  _content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread public.communication_threads%ROWTYPE;
  v_entry_id uuid;
  v_client_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  SELECT thread.*
    INTO v_thread
    FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.organization_id = thread.organization_id
     AND share.client_id = thread.client_id
     AND share.thread_id = thread.id
     AND share.is_shared
    JOIN public.client_portal_access access
      ON access.organization_id = thread.organization_id
     AND access.client_id = thread.client_id
     AND access.user_id = auth.uid()
     AND access.is_active
   WHERE thread.id = _thread_id
     AND thread.archived_at IS NULL
   FOR UPDATE OF thread;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_thread.status IN ('resolvida', 'arquivada') THEN
    RAISE EXCEPTION 'COMMUNICATION_THREAD_READ_ONLY';
  END IF;
  IF char_length(btrim(COALESCE(_content, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE';
  END IF;

  SELECT client.name
    INTO v_client_name
    FROM public.clients client
   WHERE client.organization_id = v_thread.organization_id
     AND client.id = v_thread.client_id;

  INSERT INTO public.communication_entries(
    organization_id, thread_id, entry_type, content, created_by,
    occurred_at, is_internal, contact_made, metadata
  ) VALUES (
    v_thread.organization_id, v_thread.id, 'mensagem', btrim(_content), auth.uid(),
    now(), false, true,
    jsonb_build_object('source', 'client_portal', 'author_kind', 'client')
  ) RETURNING id INTO v_entry_id;

  UPDATE public.communication_threads
     SET status = 'aguardando_equipe', updated_at = now()
   WHERE id = v_thread.id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, actor_name, action, entity, entity_id, metadata
  ) VALUES (
    v_thread.organization_id, auth.uid(), v_client_name,
    'client_portal.communication_entry_added', 'communication_thread', v_thread.id,
    jsonb_build_object('client_id', v_thread.client_id, 'entry_id', v_entry_id)
  );
  RETURN v_entry_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.client_portal_communication_management(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_client_portal_communication_shared(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_communication_threads()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_communication_entries(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_client_portal_communication_thread(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_client_portal_communication_entry(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.client_portal_communication_management(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_portal_communication_shared(uuid, uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_communication_threads()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_communication_entries(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_portal_communication_thread(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_client_portal_communication_entry(uuid, text)
  TO authenticated;

