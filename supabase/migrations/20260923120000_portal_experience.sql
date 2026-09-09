-- Portal experience: client push alerts, service ratings and callback requests.

CREATE TABLE public.client_portal_communication_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_communication_ratings_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_communication_ratings_thread_fkey
    FOREIGN KEY (organization_id, client_id, thread_id)
    REFERENCES public.communication_threads(organization_id, client_id, id) ON DELETE CASCADE,
  UNIQUE (thread_id)
);

CREATE INDEX client_portal_communication_ratings_report_idx
  ON public.client_portal_communication_ratings(organization_id, created_at DESC, rating);

CREATE TRIGGER client_portal_communication_ratings_updated_at
  BEFORE UPDATE ON public.client_portal_communication_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.client_portal_callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  access_id uuid NOT NULL REFERENCES public.client_portal_access(id) ON DELETE CASCADE,
  thread_id uuid,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL,
  requested_for timestamptz NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  assigned_to uuid,
  staff_notes text CHECK (staff_notes IS NULL OR char_length(staff_notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_callback_requests_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_callback_requests_thread_fkey
    FOREIGN KEY (organization_id, client_id, thread_id)
    REFERENCES public.communication_threads(organization_id, client_id, id) ON DELETE CASCADE
);

CREATE INDEX client_portal_callback_requests_portal_idx
  ON public.client_portal_callback_requests(requested_by, requested_for DESC);
CREATE INDEX client_portal_callback_requests_staff_idx
  ON public.client_portal_callback_requests(organization_id, status, requested_for);

CREATE TRIGGER client_portal_callback_requests_updated_at
  BEFORE UPDATE ON public.client_portal_callback_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.client_portal_communication_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_callback_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_portal_communication_ratings,
  public.client_portal_callback_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_portal_communication_ratings,
  public.client_portal_callback_requests TO service_role;

CREATE OR REPLACE FUNCTION public.register_client_portal_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth_key text,
  _user_agent text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  saved_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF char_length(COALESCE(_endpoint, '')) NOT BETWEEN 20 AND 2048
     OR char_length(COALESCE(_p256dh, '')) NOT BETWEEN 20 AND 512
     OR char_length(COALESCE(_auth_key, '')) NOT BETWEEN 8 AND 256 THEN
    RAISE EXCEPTION 'PUSH_SUBSCRIPTION_INVALID';
  END IF;

  INSERT INTO public.push_subscriptions(
    organization_id, user_id, endpoint, p256dh, auth_key, user_agent, is_active
  )
  SELECT DISTINCT access.organization_id, auth.uid(), _endpoint, _p256dh, _auth_key,
         left(_user_agent, 500), true
    FROM public.client_portal_access AS access
    JOIN public.organizations AS organization
      ON organization.id = access.organization_id AND organization.archived_at IS NULL
    JOIN public.clients AS client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id AND client.archived_at IS NULL
   WHERE access.user_id = auth.uid() AND access.is_active
  ON CONFLICT (organization_id, user_id, endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth_key = EXCLUDED.auth_key,
    user_agent = EXCLUDED.user_agent,
    is_active = true;
  GET DIAGNOSTICS saved_count = ROW_COUNT;
  IF saved_count = 0 THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  RETURN saved_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_client_portal_push_subscription(_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.push_subscriptions AS subscription
     SET is_active = false
   WHERE subscription.user_id = auth.uid()
     AND subscription.endpoint = _endpoint
     AND EXISTS (
       SELECT 1 FROM public.client_portal_access AS access
        WHERE access.organization_id = subscription.organization_id
          AND access.user_id = auth.uid() AND access.is_active
     );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_communication_push(_thread_id uuid, _actor_id uuid)
RETURNS TABLE(
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  title text,
  body text,
  action_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  thread_row public.communication_threads%ROWTYPE;
  entry_row public.communication_entries%ROWTYPE;
  recipient_ids uuid[];
  notification_title text;
  notification_url text;
BEGIN
  SELECT thread.* INTO thread_row
    FROM public.communication_threads AS thread
    JOIN public.client_portal_communication_shares AS share
      ON share.thread_id = thread.id
     AND share.organization_id = thread.organization_id
     AND share.client_id = thread.client_id
     AND share.is_shared
   WHERE thread.id = _thread_id AND thread.archived_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT entry.* INTO entry_row
    FROM public.communication_entries AS entry
   WHERE entry.thread_id = thread_row.id
     AND entry.organization_id = thread_row.organization_id
     AND entry.created_by = _actor_id
     AND entry.entry_type = 'mensagem'
     AND NOT entry.is_internal
     AND entry.created_at >= now() - interval '5 minutes'
   ORDER BY entry.created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUSH_MESSAGE_NOT_ELIGIBLE' USING ERRCODE = '42501';
  END IF;

  IF entry_row.metadata->>'source' = 'client_portal' AND EXISTS (
    SELECT 1 FROM public.client_portal_access AS access
     WHERE access.organization_id = thread_row.organization_id
       AND access.client_id = thread_row.client_id
       AND access.user_id = _actor_id AND access.is_active
  ) THEN
    IF thread_row.assigned_to IS NULL THEN RETURN; END IF;
    recipient_ids := ARRAY[thread_row.assigned_to];
    notification_title := 'Nova mensagem de cliente';
    notification_url := '/comunicacao?thread=' || thread_row.id::text;
  ELSIF EXISTS (
    SELECT 1 FROM public.organization_members AS member
     WHERE member.organization_id = thread_row.organization_id
       AND member.user_id = _actor_id AND member.is_active
       AND member.role = ANY(ARRAY[
         'superadmin','proprietario','administrador','gestor','operacional'
       ]::public.app_role[])
  ) THEN
    SELECT COALESCE(array_agg(DISTINCT access.user_id), '{}') INTO recipient_ids
      FROM public.client_portal_access AS access
     WHERE access.organization_id = thread_row.organization_id
       AND access.client_id = thread_row.client_id AND access.is_active;
    notification_title := 'A empresa respondeu você';
    notification_url := '/meu-portal?thread=' || thread_row.id::text;
  ELSE
    RAISE EXCEPTION 'PUSH_MESSAGE_NOT_ELIGIBLE' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    INSERT INTO public.push_delivery_claims(entry_id, subscription_id)
    SELECT entry_row.id, subscription.id
      FROM public.push_subscriptions AS subscription
     WHERE subscription.organization_id = thread_row.organization_id
       AND subscription.user_id = ANY(recipient_ids)
       AND subscription.is_active
    ON CONFLICT DO NOTHING
    RETURNING push_delivery_claims.subscription_id
  )
  SELECT subscription.id, subscription.endpoint, subscription.p256dh,
         subscription.auth_key, notification_title, thread_row.subject,
         notification_url
    FROM claimed
    JOIN public.push_subscriptions AS subscription
      ON subscription.id = claimed.subscription_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_communication_ratings()
RETURNS TABLE(
  thread_id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT rating_row.thread_id, rating_row.rating, rating_row.comment,
         rating_row.created_at, rating_row.updated_at
    FROM public.client_portal_communication_ratings AS rating_row
   WHERE rating_row.user_id = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.client_portal_access AS access
        WHERE access.organization_id = rating_row.organization_id
          AND access.client_id = rating_row.client_id
          AND access.user_id = auth.uid() AND access.is_active
     )
   ORDER BY rating_row.updated_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.submit_client_portal_communication_rating(
  _thread_id uuid,
  _rating smallint,
  _comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  thread_row public.communication_threads%ROWTYPE;
  saved_id uuid;
BEGIN
  IF _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'RATING_INVALID'; END IF;
  IF char_length(COALESCE(_comment, '')) > 1000 THEN RAISE EXCEPTION 'RATING_COMMENT_INVALID'; END IF;
  SELECT thread.* INTO thread_row
    FROM public.communication_threads AS thread
    JOIN public.client_portal_communication_shares AS share
      ON share.organization_id = thread.organization_id
     AND share.client_id = thread.client_id
     AND share.thread_id = thread.id AND share.is_shared
    JOIN public.client_portal_access AS access
      ON access.organization_id = thread.organization_id
     AND access.client_id = thread.client_id
     AND access.user_id = auth.uid() AND access.is_active
   WHERE thread.id = _thread_id
     AND thread.status IN ('resolvida', 'arquivada');
  IF NOT FOUND THEN RAISE EXCEPTION 'RATING_NOT_ALLOWED' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.client_portal_communication_ratings(
    organization_id, client_id, thread_id, user_id, rating, comment
  ) VALUES (
    thread_row.organization_id, thread_row.client_id, thread_row.id,
    auth.uid(), _rating, NULLIF(btrim(COALESCE(_comment, '')), '')
  )
  ON CONFLICT (thread_id) DO UPDATE SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    user_id = EXCLUDED.user_id
  WHERE client_portal_communication_ratings.organization_id = EXCLUDED.organization_id
    AND client_portal_communication_ratings.client_id = EXCLUDED.client_id
  RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'RATING_NOT_ALLOWED' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (thread_row.organization_id, auth.uid(), 'client_portal.communication.rated',
    'communication_thread', thread_row.id, jsonb_build_object('rating', _rating));
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_client_portal_callback_request(
  _access_id uuid,
  _thread_id uuid,
  _requested_for timestamptz,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  access_row public.client_portal_access%ROWTYPE;
  client_row public.clients%ROWTYPE;
  thread_row public.communication_threads%ROWTYPE;
  request_id uuid;
  created_task_id uuid;
  recipient_id uuid;
  organization_timezone text;
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
  IF _requested_for IS NULL OR _requested_for < now() + interval '15 minutes'
     OR _requested_for > now() + interval '90 days' THEN
    RAISE EXCEPTION 'CALLBACK_DATE_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(_reason, ''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'CALLBACK_REASON_INVALID';
  END IF;

  SELECT * INTO client_row FROM public.clients
   WHERE organization_id = access_row.organization_id AND id = access_row.client_id;
  IF _thread_id IS NOT NULL THEN
    SELECT thread.* INTO thread_row
      FROM public.communication_threads AS thread
      JOIN public.client_portal_communication_shares AS share
        ON share.organization_id = thread.organization_id
       AND share.client_id = thread.client_id
       AND share.thread_id = thread.id AND share.is_shared
     WHERE thread.id = _thread_id
       AND thread.organization_id = access_row.organization_id
       AND thread.client_id = access_row.client_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CALLBACK_THREAD_NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  END IF;

  recipient_id := thread_row.assigned_to;
  IF recipient_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members AS member
     WHERE member.organization_id = access_row.organization_id
       AND member.user_id = recipient_id AND member.is_active
  ) THEN
    recipient_id := client_row.owner_id;
  END IF;
  IF recipient_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members AS member
     WHERE member.organization_id = access_row.organization_id
       AND member.user_id = recipient_id AND member.is_active
  ) THEN
    SELECT member.user_id INTO recipient_id
      FROM public.organization_members AS member
     WHERE member.organization_id = access_row.organization_id AND member.is_active
       AND member.role = ANY(ARRAY['proprietario','administrador','gestor']::public.app_role[])
     ORDER BY CASE member.role WHEN 'proprietario' THEN 1 WHEN 'administrador' THEN 2 ELSE 3 END,
              member.created_at
     LIMIT 1;
  END IF;
  organization_timezone := COALESCE((
    SELECT settings.timezone FROM public.organization_settings AS settings
     WHERE settings.organization_id = access_row.organization_id
  ), 'America/Sao_Paulo');

  INSERT INTO public.client_portal_callback_requests(
    organization_id, client_id, access_id, thread_id, requested_by,
    requested_for, reason, assigned_to
  ) VALUES (
    access_row.organization_id, access_row.client_id, access_row.id, _thread_id,
    auth.uid(), _requested_for, btrim(_reason), recipient_id
  ) RETURNING id INTO request_id;

  INSERT INTO public.tasks(
    organization_id, title, description, client_id, status, priority,
    start_date, due_at, due_time, reminder_at, assignee_id, created_by
  ) VALUES (
    access_row.organization_id,
    left('Retorno solicitado: ' || client_row.name, 160),
    'Solicitação feita pelo Portal do Cliente: ' || btrim(_reason),
    access_row.client_id, 'pendente', 'media',
    _requested_for::date,
    _requested_for,
    (_requested_for AT TIME ZONE organization_timezone)::time,
    _requested_for - interval '1 hour', recipient_id, recipient_id
  ) RETURNING id INTO created_task_id;

  UPDATE public.client_portal_callback_requests
     SET task_id = created_task_id
   WHERE id = request_id;
  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (access_row.organization_id, auth.uid(), 'client_portal.callback.requested',
    'client_portal_callback_request', request_id,
    jsonb_build_object('task_id', created_task_id, 'requested_for', _requested_for));
  RETURN request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_client_portal_callback_requests()
RETURNS TABLE(
  request_id uuid,
  access_id uuid,
  thread_id uuid,
  organization_name text,
  client_name text,
  requested_for timestamptz,
  reason text,
  status text,
  staff_notes text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT request.id, request.access_id, request.thread_id,
         organization.legal_name, client.name, request.requested_for,
         request.reason, request.status, request.staff_notes, request.created_at
    FROM public.client_portal_callback_requests AS request
    JOIN public.client_portal_access AS access ON access.id = request.access_id
    JOIN public.organizations AS organization
      ON organization.id = request.organization_id AND organization.archived_at IS NULL
    JOIN public.clients AS client
      ON client.organization_id = request.organization_id
     AND client.id = request.client_id AND client.archived_at IS NULL
   WHERE request.requested_by = auth.uid()
     AND access.user_id = auth.uid() AND access.is_active
   ORDER BY request.requested_for DESC, request.id DESC;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_client_portal_callback_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE request_row public.client_portal_callback_requests%ROWTYPE;
BEGIN
  SELECT request.* INTO request_row
    FROM public.client_portal_callback_requests AS request
    JOIN public.client_portal_access AS access ON access.id = request.access_id
   WHERE request.id = _request_id AND request.requested_by = auth.uid()
     AND access.user_id = auth.uid() AND access.is_active
     AND request.status = 'pending'
   FOR UPDATE OF request;
  IF NOT FOUND THEN RAISE EXCEPTION 'CALLBACK_CANCEL_NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  UPDATE public.client_portal_callback_requests SET status = 'cancelled' WHERE id = request_row.id;
  UPDATE public.tasks SET status = 'arquivada', archived_at = now(), updated_by = request_row.assigned_to
   WHERE id = request_row.task_id AND organization_id = request_row.organization_id;
  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id)
  VALUES (request_row.organization_id, auth.uid(), 'client_portal.callback.cancelled',
    'client_portal_callback_request', request_row.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_staff_client_portal_callback_requests(_organization_id uuid)
RETURNS TABLE(
  request_id uuid,
  client_id uuid,
  client_name text,
  thread_id uuid,
  task_id uuid,
  requested_for timestamptz,
  reason text,
  status text,
  assigned_to uuid,
  assigned_name text,
  staff_notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  RETURN QUERY
  SELECT request.id, request.client_id, client.name, request.thread_id, request.task_id,
         request.requested_for, request.reason, request.status, request.assigned_to,
         COALESCE(profile.full_name, profile.email, 'Responsável'), request.staff_notes,
         request.created_at
    FROM public.client_portal_callback_requests AS request
    JOIN public.clients AS client
      ON client.organization_id = request.organization_id AND client.id = request.client_id
    LEFT JOIN public.organization_members AS member
      ON member.organization_id = request.organization_id
     AND member.user_id = request.assigned_to
    LEFT JOIN public.profiles AS profile ON profile.id = request.assigned_to
   WHERE request.organization_id = _organization_id
   ORDER BY CASE request.status WHEN 'pending' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,
            request.requested_for, request.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_staff_client_portal_callback_request(
  _organization_id uuid,
  _request_id uuid,
  _status text,
  _staff_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE request_row public.client_portal_callback_requests%ROWTYPE;
DECLARE status_label text;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  IF _status NOT IN ('confirmed', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'CALLBACK_STATUS_INVALID';
  END IF;
  IF char_length(COALESCE(_staff_notes, '')) > 1000 THEN
    RAISE EXCEPTION 'CALLBACK_NOTES_INVALID';
  END IF;
  SELECT * INTO request_row FROM public.client_portal_callback_requests
   WHERE id = _request_id AND organization_id = _organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CALLBACK_REQUEST_NOT_FOUND'; END IF;
  IF request_row.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'CALLBACK_ALREADY_CLOSED';
  END IF;

  UPDATE public.client_portal_callback_requests
     SET status = _status,
         staff_notes = NULLIF(btrim(COALESCE(_staff_notes, '')), '')
   WHERE id = request_row.id;
  UPDATE public.tasks
     SET status = CASE _status WHEN 'completed' THEN 'concluida'::public.task_status
                              WHEN 'cancelled' THEN 'arquivada'::public.task_status
                              ELSE status END,
         completed_at = CASE WHEN _status = 'completed' THEN now() ELSE completed_at END,
         completed_by = CASE WHEN _status = 'completed' THEN auth.uid() ELSE completed_by END,
         archived_at = CASE WHEN _status = 'cancelled' THEN now() ELSE archived_at END,
         updated_by = auth.uid()
   WHERE id = request_row.task_id AND organization_id = _organization_id;

  status_label := CASE _status WHEN 'confirmed' THEN 'confirmado'
                               WHEN 'completed' THEN 'concluído'
                               ELSE 'cancelado' END;
  PERFORM public.enqueue_client_portal_notification(
    request_row.organization_id, request_row.client_id, 'system',
    'Pedido de retorno ' || status_label,
    COALESCE(NULLIF(btrim(_staff_notes), ''), 'Acompanhe os detalhes na área Comunicação.'),
    NULL, NULL, 'callback:' || request_row.id::text || ':' || _status
  );
  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (_organization_id, auth.uid(), 'client_portal.callback.' || _status,
    'client_portal_callback_request', request_row.id,
    jsonb_build_object('from', request_row.status, 'to', _status));
END;
$function$;

CREATE OR REPLACE FUNCTION public.communication_experience_metrics(
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
DECLARE result jsonb;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  IF _from IS NULL OR _to IS NULL OR _from > _to OR _to - _from > interval '370 days' THEN
    RAISE EXCEPTION 'REPORT_PERIOD_INVALID';
  END IF;
  SELECT jsonb_build_object(
    'rating_average', COALESCE(round(avg(rating)::numeric, 1), 0),
    'rating_count', count(*),
    'rating_five_star', count(*) FILTER (WHERE rating = 5),
    'callback_requested', (
      SELECT count(*) FROM public.client_portal_callback_requests AS request
       WHERE request.organization_id = _organization_id
         AND request.created_at >= _from AND request.created_at < _to + interval '1 day'
    ),
    'callback_pending', (
      SELECT count(*) FROM public.client_portal_callback_requests AS request
       WHERE request.organization_id = _organization_id AND request.status IN ('pending','confirmed')
         AND request.created_at >= _from AND request.created_at < _to + interval '1 day'
    ),
    'callback_completed', (
      SELECT count(*) FROM public.client_portal_callback_requests AS request
       WHERE request.organization_id = _organization_id AND request.status = 'completed'
         AND request.created_at >= _from AND request.created_at < _to + interval '1 day'
    )
  ) INTO result
    FROM public.client_portal_communication_ratings AS rating_row
   WHERE rating_row.organization_id = _organization_id
     AND rating_row.created_at >= _from AND rating_row.created_at < _to + interval '1 day';
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_client_portal_push_subscription(text,text,text,text),
  public.remove_client_portal_push_subscription(text),
  public.client_portal_communication_ratings(),
  public.submit_client_portal_communication_rating(uuid,smallint,text),
  public.create_client_portal_callback_request(uuid,uuid,timestamptz,text),
  public.list_client_portal_callback_requests(),
  public.cancel_client_portal_callback_request(uuid),
  public.list_staff_client_portal_callback_requests(uuid),
  public.update_staff_client_portal_callback_request(uuid,uuid,text,text),
  public.communication_experience_metrics(uuid,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_client_portal_push_subscription(text,text,text,text),
  public.remove_client_portal_push_subscription(text),
  public.client_portal_communication_ratings(),
  public.submit_client_portal_communication_rating(uuid,smallint,text),
  public.create_client_portal_callback_request(uuid,uuid,timestamptz,text),
  public.list_client_portal_callback_requests(),
  public.cancel_client_portal_callback_request(uuid),
  public.list_staff_client_portal_callback_requests(uuid),
  public.update_staff_client_portal_callback_request(uuid,uuid,text,text),
  public.communication_experience_metrics(uuid,timestamptz,timestamptz)
  TO authenticated;

REVOKE ALL ON FUNCTION public.prepare_communication_push(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_communication_push(uuid,uuid) TO service_role;
