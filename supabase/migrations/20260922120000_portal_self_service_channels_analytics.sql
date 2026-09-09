-- Portal self-service, official communication channel foundations and management analytics.
-- Provider credentials remain exclusively in Supabase Edge Function secrets.

CREATE TABLE public.client_portal_faq_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  answer text NOT NULL CHECK (char_length(btrim(answer)) BETWEEN 3 AND 5000),
  category text NOT NULL DEFAULT 'Geral' CHECK (char_length(btrim(category)) BETWEEN 2 AND 60),
  keywords text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX client_portal_faq_articles_org_title_idx
  ON public.client_portal_faq_articles (organization_id, lower(title));
CREATE INDEX client_portal_faq_articles_published_idx
  ON public.client_portal_faq_articles (organization_id, is_published, sort_order, category);

CREATE TRIGGER client_portal_faq_articles_updated_at
  BEFORE UPDATE ON public.client_portal_faq_articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.client_portal_faq_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  article_id uuid REFERENCES public.client_portal_faq_articles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('view', 'helpful', 'not_helpful', 'escalated', 'search')),
  search_term text CHECK (search_term IS NULL OR char_length(search_term) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_faq_events_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX client_portal_faq_events_reporting_idx
  ON public.client_portal_faq_events (organization_id, created_at DESC, event_type);

ALTER TABLE public.client_portal_faq_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_faq_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_portal_faq_articles, public.client_portal_faq_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_portal_faq_articles, public.client_portal_faq_events TO service_role;

CREATE OR REPLACE FUNCTION public.list_client_portal_faq_articles(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', article.id,
      'title', article.title,
      'answer', article.answer,
      'category', article.category,
      'keywords', article.keywords,
      'sort_order', article.sort_order,
      'is_published', article.is_published,
      'created_at', article.created_at,
      'updated_at', article.updated_at
    ) ORDER BY article.is_published DESC, article.sort_order, article.category, article.title)
      FROM public.client_portal_faq_articles AS article
     WHERE article.organization_id = _organization_id
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_client_portal_faq_article(
  _organization_id uuid,
  _article_id uuid,
  _title text,
  _answer text,
  _category text DEFAULT 'Geral',
  _keywords text[] DEFAULT '{}',
  _sort_order integer DEFAULT 0,
  _is_published boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  saved_id uuid;
  action_name text;
  clean_keywords text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'FAQ_MANAGEMENT_DENIED' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(_title, ''))) NOT BETWEEN 3 AND 160 THEN
    RAISE EXCEPTION 'FAQ_TITLE_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(_answer, ''))) NOT BETWEEN 3 AND 5000 THEN
    RAISE EXCEPTION 'FAQ_ANSWER_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(_category, ''))) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'FAQ_CATEGORY_INVALID';
  END IF;
  IF COALESCE(_sort_order, 0) NOT BETWEEN 0 AND 9999 THEN
    RAISE EXCEPTION 'FAQ_SORT_ORDER_INVALID';
  END IF;

  SELECT COALESCE(array_agg(keyword ORDER BY keyword), '{}')
    INTO clean_keywords
    FROM (
      SELECT DISTINCT left(lower(btrim(value)), 40) AS keyword
        FROM unnest(COALESCE(_keywords, '{}')) AS value
       WHERE char_length(btrim(value)) BETWEEN 2 AND 40
       LIMIT 20
    ) AS normalized;

  IF _article_id IS NULL THEN
    INSERT INTO public.client_portal_faq_articles (
      organization_id, title, answer, category, keywords, sort_order,
      is_published, created_by, updated_by
    ) VALUES (
      _organization_id, btrim(_title), btrim(_answer), btrim(_category), clean_keywords,
      COALESCE(_sort_order, 0), COALESCE(_is_published, true), auth.uid(), auth.uid()
    ) RETURNING id INTO saved_id;
    action_name := 'client_portal.faq.created';
  ELSE
    UPDATE public.client_portal_faq_articles AS article
       SET title = btrim(_title),
           answer = btrim(_answer),
           category = btrim(_category),
           keywords = clean_keywords,
           sort_order = COALESCE(_sort_order, 0),
           is_published = COALESCE(_is_published, true),
           updated_by = auth.uid()
     WHERE article.id = _article_id
       AND article.organization_id = _organization_id
     RETURNING article.id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'FAQ_ARTICLE_NOT_FOUND'; END IF;
    action_name := 'client_portal.faq.updated';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), action_name, 'client_portal_faq_article', saved_id,
    jsonb_build_object('title', btrim(_title), 'category', btrim(_category),
      'is_published', COALESCE(_is_published, true))
  );
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_client_portal_faq_articles(_access_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  access_row public.client_portal_access%ROWTYPE;
BEGIN
  SELECT access.* INTO access_row
    FROM public.client_portal_access AS access
    JOIN public.organizations AS organization
      ON organization.id = access.organization_id AND organization.archived_at IS NULL
    JOIN public.clients AS client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id AND client.archived_at IS NULL
   WHERE access.id = _access_id AND access.user_id = auth.uid() AND access.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_ACCESS_NOT_FOUND' USING ERRCODE = '42501'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', article.id,
      'title', article.title,
      'answer', article.answer,
      'category', article.category,
      'keywords', article.keywords
    ) ORDER BY article.sort_order, article.category, article.title)
      FROM public.client_portal_faq_articles AS article
     WHERE article.organization_id = access_row.organization_id
       AND article.is_published
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_my_client_portal_faq_event(
  _access_id uuid,
  _article_id uuid,
  _event_type text,
  _search_term text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  access_row public.client_portal_access%ROWTYPE;
BEGIN
  SELECT access.* INTO access_row
    FROM public.client_portal_access AS access
   WHERE access.id = _access_id AND access.user_id = auth.uid() AND access.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_ACCESS_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF _event_type IS NULL OR _event_type NOT IN ('view', 'helpful', 'not_helpful', 'escalated', 'search') THEN
    RAISE EXCEPTION 'FAQ_EVENT_INVALID';
  END IF;
  IF _article_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_portal_faq_articles AS article
     WHERE article.id = _article_id
       AND article.organization_id = access_row.organization_id
       AND article.is_published
  ) THEN RAISE EXCEPTION 'FAQ_ARTICLE_NOT_FOUND'; END IF;
  IF (
    SELECT count(*) FROM public.client_portal_faq_events AS event
     WHERE event.user_id = auth.uid() AND event.created_at >= now() - interval '1 hour'
  ) >= 120 THEN RAISE EXCEPTION 'FAQ_EVENT_RATE_LIMIT'; END IF;

  INSERT INTO public.client_portal_faq_events (
    organization_id, client_id, user_id, article_id, event_type, search_term
  ) VALUES (
    access_row.organization_id, access_row.client_id, auth.uid(), _article_id,
    _event_type, nullif(left(btrim(COALESCE(_search_term, '')), 160), '')
  );
END;
$function$;

CREATE TABLE public.communication_channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  channel public.communication_channel NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  provider text NOT NULL CHECK (provider IN ('meta_cloud_api', 'resend')),
  sender_identifier text NOT NULL CHECK (char_length(btrim(sender_identifier)) BETWEEN 3 AND 240),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'error')),
  is_enabled boolean NOT NULL DEFAULT false,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_error_code text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, channel)
);

CREATE UNIQUE INDEX communication_channel_connections_sender_idx
  ON public.communication_channel_connections (channel, provider, lower(sender_identifier));

CREATE TRIGGER communication_channel_connections_updated_at
  BEFORE UPDATE ON public.communication_channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.communication_channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES public.communication_channel_connections(id) ON DELETE RESTRICT,
  thread_id uuid REFERENCES public.communication_threads(id) ON DELETE SET NULL,
  client_id uuid,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  external_message_id text NOT NULL,
  external_sender text NOT NULL,
  external_recipient text NOT NULL,
  subject text,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 10000),
  status text NOT NULL CHECK (status IN ('received', 'pending_match', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_channel_messages_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE RESTRICT,
  UNIQUE (connection_id, external_message_id)
);

CREATE INDEX communication_channel_messages_report_idx
  ON public.communication_channel_messages (organization_id, occurred_at DESC, direction, status);
CREATE INDEX communication_channel_messages_pending_idx
  ON public.communication_channel_messages (organization_id, status, occurred_at DESC)
  WHERE status = 'pending_match';

ALTER TABLE public.communication_channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_channel_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.communication_channel_connections, public.communication_channel_messages
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.communication_channel_connections, public.communication_channel_messages TO service_role;

CREATE OR REPLACE FUNCTION public.list_communication_channel_connections(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', connection.id,
      'channel', connection.channel,
      'provider', connection.provider,
      'sender_identifier', connection.sender_identifier,
      'display_name', connection.display_name,
      'status', connection.status,
      'is_enabled', connection.is_enabled,
      'last_inbound_at', connection.last_inbound_at,
      'last_outbound_at', connection.last_outbound_at,
      'last_error_code', connection.last_error_code
    ) ORDER BY connection.channel)
      FROM public.communication_channel_connections AS connection
     WHERE connection.organization_id = _organization_id
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_communication_channel_connection(
  _organization_id uuid,
  _channel public.communication_channel,
  _sender_identifier text,
  _display_name text,
  _is_enabled boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  saved_id uuid;
  expected_provider text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN RAISE EXCEPTION 'CHANNEL_CONNECTION_MANAGEMENT_DENIED' USING ERRCODE = '42501'; END IF;
  IF _channel IS NULL OR _channel NOT IN ('whatsapp', 'email') THEN RAISE EXCEPTION 'CHANNEL_NOT_SUPPORTED'; END IF;
  IF char_length(btrim(COALESCE(_sender_identifier, ''))) NOT BETWEEN 3 AND 240 THEN
    RAISE EXCEPTION 'CHANNEL_SENDER_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(_display_name, ''))) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'CHANNEL_DISPLAY_NAME_INVALID';
  END IF;
  IF _display_name ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CHANNEL_DISPLAY_NAME_INVALID'; END IF;
  IF _channel = 'whatsapp' AND (
    btrim(_sender_identifier) !~ '^[0-9]{5,30}$'
  ) THEN RAISE EXCEPTION 'CHANNEL_SENDER_INVALID'; END IF;
  IF _channel = 'email' AND (
    lower(btrim(_sender_identifier)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) THEN RAISE EXCEPTION 'CHANNEL_SENDER_INVALID'; END IF;
  expected_provider := CASE WHEN _channel = 'whatsapp' THEN 'meta_cloud_api' ELSE 'resend' END;

  INSERT INTO public.communication_channel_connections (
    organization_id, channel, provider, sender_identifier, display_name,
    status, is_enabled, created_by, updated_by
  ) VALUES (
    _organization_id, _channel, expected_provider, btrim(_sender_identifier),
    btrim(_display_name), CASE WHEN _is_enabled THEN 'pending' ELSE 'paused' END,
    COALESCE(_is_enabled, false), auth.uid(), auth.uid()
  ) ON CONFLICT (organization_id, channel) DO UPDATE SET
    provider = EXCLUDED.provider,
    sender_identifier = EXCLUDED.sender_identifier,
    display_name = EXCLUDED.display_name,
    status = CASE WHEN EXCLUDED.is_enabled THEN 'pending' ELSE 'paused' END,
    is_enabled = EXCLUDED.is_enabled,
    last_error_code = NULL,
    updated_by = auth.uid()
  RETURNING id INTO saved_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'communication.channel.connection.updated',
    'communication_channel_connection', saved_id,
    jsonb_build_object('channel', _channel, 'provider', expected_provider,
      'is_enabled', COALESCE(_is_enabled, false))
  );
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_communication_channel_send(
  _thread_id uuid,
  _content text,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  thread_row public.communication_threads%ROWTYPE;
  connection_row public.communication_channel_connections%ROWTYPE;
  client_row public.clients%ROWTYPE;
  recipient text;
BEGIN
  SELECT * INTO thread_row FROM public.communication_threads
   WHERE id = _thread_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members AS member
     WHERE member.organization_id = thread_row.organization_id
       AND member.user_id = _actor_id AND member.is_active
       AND member.role = ANY(ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[])
  ) THEN RAISE EXCEPTION 'COMMUNICATION_WRITE_PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;
  IF thread_row.channel NOT IN ('whatsapp', 'email') THEN RAISE EXCEPTION 'CHANNEL_NOT_SUPPORTED'; END IF;
  IF char_length(btrim(COALESCE(_content, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'CHANNEL_MESSAGE_INVALID';
  END IF;
  SELECT * INTO connection_row FROM public.communication_channel_connections
   WHERE organization_id = thread_row.organization_id
     AND channel = thread_row.channel AND is_enabled AND status <> 'paused';
  IF NOT FOUND THEN RAISE EXCEPTION 'CHANNEL_CONNECTION_NOT_READY'; END IF;
  SELECT * INTO client_row FROM public.clients
   WHERE id = thread_row.client_id AND organization_id = thread_row.organization_id
     AND archived_at IS NULL;
  recipient := CASE WHEN thread_row.channel = 'whatsapp'
    THEN regexp_replace(COALESCE(client_row.whatsapp, client_row.phone, ''), '\D', '', 'g')
    ELSE lower(btrim(COALESCE(client_row.email, ''))) END;
  IF recipient = '' THEN RAISE EXCEPTION 'CHANNEL_RECIPIENT_MISSING'; END IF;

  RETURN jsonb_build_object(
    'connection_id', connection_row.id,
    'organization_id', thread_row.organization_id,
    'thread_id', thread_row.id,
    'channel', thread_row.channel,
    'provider', connection_row.provider,
    'sender_identifier', connection_row.sender_identifier,
    'sender_name', connection_row.display_name,
    'recipient', recipient,
    'subject', thread_row.subject,
    'content', btrim(_content)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_communication_channel_send(
  _connection_id uuid,
  _thread_id uuid,
  _actor_id uuid,
  _content text,
  _provider_message_id text,
  _status text,
  _error_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  connection_row public.communication_channel_connections%ROWTYPE;
  thread_row public.communication_threads%ROWTYPE;
  client_row public.clients%ROWTYPE;
  message_id uuid;
BEGIN
  SELECT * INTO connection_row FROM public.communication_channel_connections WHERE id = _connection_id;
  SELECT * INTO thread_row FROM public.communication_threads
   WHERE id = _thread_id AND organization_id = connection_row.organization_id;
  SELECT * INTO client_row FROM public.clients
   WHERE id = thread_row.client_id AND organization_id = thread_row.organization_id;
  IF connection_row.id IS NULL OR thread_row.id IS NULL THEN RAISE EXCEPTION 'CHANNEL_CONTEXT_INVALID'; END IF;

  INSERT INTO public.communication_channel_messages (
    organization_id, connection_id, thread_id, client_id, direction,
    external_message_id, external_sender, external_recipient, subject, content,
    status, error_code
  ) VALUES (
    thread_row.organization_id, connection_row.id, thread_row.id, thread_row.client_id, 'outbound',
    COALESCE(NULLIF(_provider_message_id, ''), gen_random_uuid()::text),
    connection_row.sender_identifier,
    CASE WHEN connection_row.channel = 'whatsapp'
      THEN regexp_replace(COALESCE(client_row.whatsapp, client_row.phone, ''), '\D', '', 'g')
      ELSE lower(btrim(COALESCE(client_row.email, ''))) END,
    thread_row.subject, btrim(_content),
    CASE WHEN _status IN ('sent', 'delivered', 'read', 'failed') THEN _status ELSE 'failed' END,
    nullif(left(COALESCE(_error_code, ''), 120), '')
  ) RETURNING id INTO message_id;

  IF _status <> 'failed' THEN
    INSERT INTO public.communication_entries (
      organization_id, thread_id, entry_type, content, created_by,
      is_internal, contact_made, metadata
    ) VALUES (
      thread_row.organization_id, thread_row.id,
      CASE WHEN connection_row.channel = 'whatsapp' THEN 'whatsapp' ELSE 'email' END,
      btrim(_content), _actor_id, false, true,
      jsonb_build_object('source', 'channel_outbound', 'provider', connection_row.provider,
        'provider_message_id', _provider_message_id, 'channel_message_id', message_id)
    );
    UPDATE public.communication_threads SET status = 'aguardando_cliente', updated_at = now()
     WHERE id = thread_row.id;
    UPDATE public.communication_channel_connections
       SET status = 'active', last_outbound_at = now(), last_error_code = NULL
     WHERE id = connection_row.id;
  ELSE
    UPDATE public.communication_channel_connections
       SET status = 'error', last_error_code = nullif(left(COALESCE(_error_code, ''), 120), '')
     WHERE id = connection_row.id;
  END IF;
  RETURN message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_communication_channel_message(
  _provider text,
  _channel public.communication_channel,
  _sender_identifier text,
  _external_message_id text,
  _external_sender text,
  _external_recipient text,
  _subject text,
  _content text,
  _occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  connection_row public.communication_channel_connections%ROWTYPE;
  matched_client public.clients%ROWTYPE;
  matched_thread public.communication_threads%ROWTYPE;
  channel_message_id uuid;
  existing_message_id uuid;
  normalized_sender text;
BEGIN
  SELECT * INTO connection_row FROM public.communication_channel_connections
   WHERE provider = _provider AND channel = _channel
     AND lower(sender_identifier) = lower(btrim(_sender_identifier)) AND is_enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHANNEL_CONNECTION_NOT_FOUND'; END IF;
  IF char_length(btrim(COALESCE(_content, ''))) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'CHANNEL_MESSAGE_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(_external_message_id, ''))) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'CHANNEL_EXTERNAL_MESSAGE_ID_INVALID';
  END IF;
  normalized_sender := CASE WHEN _channel = 'whatsapp'
    THEN regexp_replace(COALESCE(_external_sender, ''), '\D', '', 'g')
    ELSE lower(regexp_replace(COALESCE(_external_sender, ''), '^.*<([^>]+)>.*$', '\1')) END;

  IF _channel = 'whatsapp' THEN
    SELECT * INTO matched_client FROM public.clients AS client
     WHERE client.organization_id = connection_row.organization_id
       AND client.archived_at IS NULL
       AND regexp_replace(COALESCE(client.whatsapp, client.phone, ''), '\D', '', 'g') = normalized_sender
     ORDER BY client.updated_at DESC LIMIT 1;
  ELSE
    SELECT * INTO matched_client FROM public.clients AS client
     WHERE client.organization_id = connection_row.organization_id
       AND client.archived_at IS NULL AND lower(btrim(client.email)) = normalized_sender
     ORDER BY client.updated_at DESC LIMIT 1;
  END IF;

  IF matched_client.id IS NULL THEN
    SELECT client.* INTO matched_client
      FROM public.communication_channel_messages AS previous
      JOIN public.clients AS client
        ON client.organization_id = previous.organization_id
       AND client.id = previous.client_id
       AND client.archived_at IS NULL
     WHERE previous.connection_id = connection_row.id
       AND previous.external_sender = normalized_sender
       AND previous.client_id IS NOT NULL
     ORDER BY previous.occurred_at DESC
     LIMIT 1;
  END IF;

  IF matched_client.id IS NOT NULL THEN
    SELECT * INTO matched_thread FROM public.communication_threads AS thread
     WHERE thread.organization_id = connection_row.organization_id
       AND thread.client_id = matched_client.id AND thread.channel = _channel
       AND thread.archived_at IS NULL AND thread.status <> 'resolvida'
     ORDER BY thread.updated_at DESC LIMIT 1;
    IF matched_thread.id IS NULL THEN
      INSERT INTO public.communication_threads (
        organization_id, client_id, subject, channel, status, priority, created_by
      ) VALUES (
        connection_row.organization_id, matched_client.id,
        left(COALESCE(nullif(btrim(_subject), ''),
          CASE WHEN _channel = 'whatsapp' THEN 'Conversa pelo WhatsApp' ELSE 'Conversa por e-mail' END), 240),
        _channel, 'aguardando_equipe', 'normal', COALESCE(matched_client.created_by, connection_row.created_by)
      ) RETURNING * INTO matched_thread;
    END IF;
  END IF;

  INSERT INTO public.communication_channel_messages (
    organization_id, connection_id, thread_id, client_id, direction,
    external_message_id, external_sender, external_recipient, subject, content,
    status, occurred_at
  ) VALUES (
    connection_row.organization_id, connection_row.id, matched_thread.id, matched_client.id,
    'inbound', _external_message_id, normalized_sender, _external_recipient,
    nullif(left(btrim(COALESCE(_subject, '')), 240), ''), btrim(_content),
    CASE WHEN matched_client.id IS NULL THEN 'pending_match' ELSE 'received' END,
    COALESCE(_occurred_at, now())
  ) ON CONFLICT (connection_id, external_message_id) DO NOTHING
  RETURNING id INTO channel_message_id;

  IF channel_message_id IS NULL THEN
    SELECT id INTO existing_message_id FROM public.communication_channel_messages
     WHERE connection_id = connection_row.id AND external_message_id = _external_message_id;
    RETURN existing_message_id;
  END IF;

  IF matched_thread.id IS NOT NULL THEN
    INSERT INTO public.communication_entries (
      organization_id, thread_id, entry_type, content, created_by,
      occurred_at, is_internal, contact_made, metadata
    ) VALUES (
      connection_row.organization_id, matched_thread.id,
      CASE WHEN _channel = 'whatsapp' THEN 'whatsapp' ELSE 'email' END,
      btrim(_content), COALESCE(matched_client.created_by, connection_row.created_by), COALESCE(_occurred_at, now()), false, true,
      jsonb_build_object('source', 'channel_inbound', 'provider', _provider,
        'author_kind', 'client', 'provider_message_id', _external_message_id,
        'channel_message_id', channel_message_id)
    );
    UPDATE public.communication_threads SET status = 'aguardando_equipe', updated_at = now()
     WHERE id = matched_thread.id;
  END IF;
  UPDATE public.communication_channel_connections
     SET status = 'active', last_inbound_at = now(), last_error_code = NULL
   WHERE id = connection_row.id;
  RETURN channel_message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_unmatched_communication_channel_messages(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', pending.id, 'channel', pending.channel,
      'external_sender', pending.external_sender, 'subject', pending.subject,
      'content', pending.content, 'occurred_at', pending.occurred_at
    ) ORDER BY pending.occurred_at DESC)
      FROM (
        SELECT message.id, connection.channel, message.external_sender,
               message.subject, message.content, message.occurred_at
          FROM public.communication_channel_messages AS message
          JOIN public.communication_channel_connections AS connection
            ON connection.id = message.connection_id
         WHERE message.organization_id = _organization_id
           AND message.status = 'pending_match'
         ORDER BY message.occurred_at DESC
         LIMIT 100
      ) AS pending
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.match_communication_channel_message(
  _organization_id uuid,
  _message_id uuid,
  _client_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  message_row public.communication_channel_messages%ROWTYPE;
  connection_row public.communication_channel_connections%ROWTYPE;
  matched_thread_id uuid;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  SELECT * INTO message_row FROM public.communication_channel_messages
   WHERE id = _message_id AND organization_id = _organization_id AND status = 'pending_match' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHANNEL_MESSAGE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id
    AND organization_id = _organization_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND';
  END IF;
  SELECT * INTO connection_row FROM public.communication_channel_connections WHERE id = message_row.connection_id;
  SELECT thread.id INTO matched_thread_id
    FROM public.communication_threads AS thread
   WHERE thread.organization_id = _organization_id
     AND thread.client_id = _client_id
     AND thread.channel = connection_row.channel
     AND thread.archived_at IS NULL
     AND thread.status <> 'resolvida'
   ORDER BY thread.updated_at DESC
   LIMIT 1;
  IF matched_thread_id IS NULL THEN
    INSERT INTO public.communication_threads (
      organization_id, client_id, subject, channel, status, priority, created_by
    ) VALUES (
      _organization_id, _client_id,
      left(COALESCE(message_row.subject,
        CASE WHEN connection_row.channel = 'whatsapp' THEN 'Conversa pelo WhatsApp' ELSE 'Conversa por e-mail' END), 240),
      connection_row.channel, 'aguardando_equipe', 'normal', auth.uid()
    ) RETURNING id INTO matched_thread_id;
  END IF;
  INSERT INTO public.communication_entries (
    organization_id, thread_id, entry_type, content, created_by, occurred_at,
    is_internal, contact_made, metadata
  ) VALUES (
    _organization_id, matched_thread_id,
    CASE WHEN connection_row.channel = 'whatsapp' THEN 'whatsapp' ELSE 'email' END,
    message_row.content, auth.uid(), message_row.occurred_at, false, true,
    jsonb_build_object('source', 'channel_inbound', 'provider', connection_row.provider,
      'author_kind', 'client', 'provider_message_id', message_row.external_message_id,
      'channel_message_id', message_row.id)
  );
  UPDATE public.communication_channel_messages
     SET client_id = _client_id, thread_id = matched_thread_id, status = 'received'
   WHERE id = message_row.id;
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (_organization_id, auth.uid(), 'communication.channel.message.matched',
    'communication_channel_message', message_row.id,
    jsonb_build_object('client_id', _client_id, 'thread_id', matched_thread_id));
  RETURN matched_thread_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.communication_service_metrics(
  _organization_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  result jsonb;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  IF _from IS NULL OR _to IS NULL OR _from > _to OR _to - _from > interval '370 days' THEN
    RAISE EXCEPTION 'REPORT_PERIOD_INVALID';
  END IF;
  WITH selected_threads AS (
    SELECT thread.* FROM public.communication_threads AS thread
     WHERE thread.organization_id = _organization_id
       AND thread.created_at >= _from AND thread.created_at < _to + interval '1 day'
  ), response_times AS (
    SELECT thread.id,
      extract(epoch FROM (response.occurred_at - inbound.occurred_at)) / 60.0 AS minutes
      FROM selected_threads AS thread
      JOIN LATERAL (
        SELECT entry.occurred_at FROM public.communication_entries AS entry
         WHERE entry.thread_id = thread.id AND NOT entry.is_internal
           AND (entry.metadata->>'source' IN ('client_portal', 'channel_inbound')
             OR entry.metadata->>'author_kind' = 'client')
         ORDER BY entry.occurred_at LIMIT 1
      ) AS inbound ON true
      JOIN LATERAL (
        SELECT entry.occurred_at FROM public.communication_entries AS entry
         WHERE entry.thread_id = thread.id AND NOT entry.is_internal
           AND entry.occurred_at >= inbound.occurred_at
           AND COALESCE(entry.metadata->>'author_kind', 'company') <> 'client'
           AND COALESCE(entry.metadata->>'source', '') NOT IN ('client_portal', 'channel_inbound')
         ORDER BY entry.occurred_at LIMIT 1
      ) AS response ON true
  ), faq AS (
    SELECT
      count(*) FILTER (WHERE event_type = 'view') AS views,
      count(*) FILTER (WHERE event_type = 'helpful') AS helpful,
      count(*) FILTER (WHERE event_type = 'not_helpful') AS not_helpful,
      count(*) FILTER (WHERE event_type = 'escalated') AS escalated,
      count(DISTINCT client_id) AS clients
    FROM public.client_portal_faq_events
    WHERE organization_id = _organization_id
      AND created_at >= _from AND created_at < _to + interval '1 day'
  ), channel_totals AS (
    SELECT
      count(*) FILTER (WHERE direction = 'inbound') AS inbound,
      count(*) FILTER (WHERE direction = 'outbound') AS outbound,
      count(*) FILTER (WHERE status = 'failed') AS failed,
      count(*) FILTER (WHERE status = 'pending_match') AS pending_match
    FROM public.communication_channel_messages
    WHERE organization_id = _organization_id
      AND occurred_at >= _from AND occurred_at < _to + interval '1 day'
  )
  SELECT jsonb_build_object(
    'conversations', (SELECT count(*) FROM selected_threads),
    'resolved', (SELECT count(*) FROM selected_threads WHERE status = 'resolvida'),
    'waiting_team', (SELECT count(*) FROM selected_threads WHERE status = 'aguardando_equipe'),
    'average_first_response_minutes', COALESCE((SELECT round(avg(minutes)::numeric, 1) FROM response_times), 0),
    'by_channel', COALESCE((SELECT jsonb_object_agg(channel, total) FROM (
      SELECT channel::text, count(*) AS total FROM selected_threads GROUP BY channel
    ) grouped), '{}'::jsonb),
    'faq_views', COALESCE((SELECT views FROM faq), 0),
    'faq_helpful', COALESCE((SELECT helpful FROM faq), 0),
    'faq_not_helpful', COALESCE((SELECT not_helpful FROM faq), 0),
    'faq_escalated', COALESCE((SELECT escalated FROM faq), 0),
    'faq_clients', COALESCE((SELECT clients FROM faq), 0),
    'faq_deflection_rate', COALESCE((SELECT round(100.0 * helpful / NULLIF(helpful + escalated, 0), 1) FROM faq), 0),
    'channel_inbound', COALESCE((SELECT inbound FROM channel_totals), 0),
    'channel_outbound', COALESCE((SELECT outbound FROM channel_totals), 0),
    'channel_failed', COALESCE((SELECT failed FROM channel_totals), 0),
    'channel_pending_match', COALESCE((SELECT pending_match FROM channel_totals), 0)
  ) INTO result;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_client_portal_faq_articles(uuid),
  public.save_client_portal_faq_article(uuid, uuid, text, text, text, text[], integer, boolean),
  public.list_my_client_portal_faq_articles(uuid),
  public.record_my_client_portal_faq_event(uuid, uuid, text, text),
  public.list_communication_channel_connections(uuid),
  public.save_communication_channel_connection(uuid, public.communication_channel, text, text, boolean),
  public.prepare_communication_channel_send(uuid, text, uuid),
  public.complete_communication_channel_send(uuid, uuid, uuid, text, text, text, text),
  public.ingest_communication_channel_message(text, public.communication_channel, text, text, text, text, text, text, timestamptz),
  public.list_unmatched_communication_channel_messages(uuid),
  public.match_communication_channel_message(uuid, uuid, uuid),
  public.communication_service_metrics(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_client_portal_faq_articles(uuid),
  public.save_client_portal_faq_article(uuid, uuid, text, text, text, text[], integer, boolean),
  public.list_my_client_portal_faq_articles(uuid),
  public.record_my_client_portal_faq_event(uuid, uuid, text, text),
  public.list_communication_channel_connections(uuid),
  public.save_communication_channel_connection(uuid, public.communication_channel, text, text, boolean),
  public.list_unmatched_communication_channel_messages(uuid),
  public.match_communication_channel_message(uuid, uuid, uuid),
  public.communication_service_metrics(uuid, timestamptz, timestamptz)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_communication_channel_send(uuid, text, uuid),
  public.complete_communication_channel_send(uuid, uuid, uuid, text, text, text, text),
  public.ingest_communication_channel_message(text, public.communication_channel, text, text, text, text, text, text, timestamptz)
  TO service_role;

INSERT INTO public.client_portal_faq_articles (
  organization_id, title, answer, category, keywords, sort_order, created_by, updated_by
)
SELECT organization.id, seed.title, seed.answer, seed.category, seed.keywords, seed.sort_order,
       organization.created_by, organization.created_by
  FROM public.organizations AS organization
 CROSS JOIN (VALUES
   ('Como acompanho meus processos?', 'Abra a seção Processos para ver as etapas, os prazos e as atualizações que a empresa compartilhou com você.', 'Processos', ARRAY['andamento','etapas','prazo'], 10),
   ('Onde envio um documento solicitado?', 'Abra Pendências, escolha a solicitação e envie o arquivo no próprio cartão. O andamento da análise ficará disponível ali.', 'Documentos', ARRAY['arquivo','enviar','pendência'], 20),
   ('Como falo com a empresa?', 'Use Comunicação para iniciar uma conversa ou responder um atendimento existente. A equipe receberá sua mensagem dentro do FLUXA.', 'Atendimento', ARRAY['mensagem','contato','dúvida'], 30)
 ) AS seed(title, answer, category, keywords, sort_order)
ON CONFLICT DO NOTHING;
