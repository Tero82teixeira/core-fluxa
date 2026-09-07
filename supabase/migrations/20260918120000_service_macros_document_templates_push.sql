-- Productivity pack: reviewed communication macros, reusable document-request
-- templates and opt-in Web Push subscriptions.

CREATE TABLE public.communication_macros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
  reply_content text CHECK (reply_content IS NULL OR char_length(btrim(reply_content)) BETWEEN 2 AND 2000),
  status_after public.communication_status,
  priority_after public.communication_priority,
  assign_to_self boolean NOT NULL DEFAULT false,
  follow_up_hours integer CHECK (follow_up_hours IS NULL OR follow_up_hours BETWEEN 1 AND 720),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, title)
);

CREATE TRIGGER communication_macros_updated_at
  BEFORE UPDATE ON public.communication_macros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_request_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 20),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, title)
);

CREATE TRIGGER document_request_templates_updated_at
  BEFORE UPDATE ON public.document_request_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  endpoint text NOT NULL CHECK (char_length(endpoint) BETWEEN 20 AND 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 512),
  auth_key text NOT NULL CHECK (char_length(auth_key) BETWEEN 8 AND 256),
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, endpoint)
);

CREATE INDEX push_subscriptions_recipient_idx
  ON public.push_subscriptions (organization_id, user_id)
  WHERE is_active;

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.push_delivery_claims (
  entry_id uuid NOT NULL REFERENCES public.communication_entries(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, subscription_id)
);

ALTER TABLE public.communication_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_delivery_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.communication_macros FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.document_request_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_delivery_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_communication_macros(_organization_id uuid)
RETURNS TABLE(
  id uuid, title text, reply_content text, status_after text, priority_after text,
  assign_to_self boolean, follow_up_hours integer, is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  RETURN QUERY
  SELECT macro.id, macro.title, macro.reply_content, macro.status_after::text,
         macro.priority_after::text, macro.assign_to_self, macro.follow_up_hours,
         macro.is_active
    FROM public.communication_macros AS macro
   WHERE macro.organization_id = _organization_id
   ORDER BY macro.is_active DESC, macro.title;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_communication_macro(
  _organization_id uuid,
  _macro_id uuid,
  _title text,
  _reply_content text DEFAULT NULL,
  _status_after public.communication_status DEFAULT NULL,
  _priority_after public.communication_priority DEFAULT NULL,
  _assign_to_self boolean DEFAULT false,
  _follow_up_hours integer DEFAULT NULL,
  _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE saved_id uuid;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  IF char_length(btrim(COALESCE(_title, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'MACRO_TITLE_INVALID';
  END IF;
  IF NULLIF(btrim(COALESCE(_reply_content, '')), '') IS NULL
     AND _status_after IS NULL AND _priority_after IS NULL
     AND NOT COALESCE(_assign_to_self, false) AND _follow_up_hours IS NULL THEN
    RAISE EXCEPTION 'MACRO_ACTION_REQUIRED';
  END IF;
  IF _reply_content IS NOT NULL AND char_length(btrim(_reply_content)) > 2000 THEN
    RAISE EXCEPTION 'MACRO_REPLY_INVALID';
  END IF;
  IF _follow_up_hours IS NOT NULL AND _follow_up_hours NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'MACRO_FOLLOW_UP_INVALID';
  END IF;

  INSERT INTO public.communication_macros(
    id, organization_id, title, reply_content, status_after, priority_after,
    assign_to_self, follow_up_hours, is_active, created_by, updated_by
  ) VALUES (
    COALESCE(_macro_id, gen_random_uuid()), _organization_id, btrim(_title),
    NULLIF(btrim(COALESCE(_reply_content, '')), ''), _status_after, _priority_after,
    COALESCE(_assign_to_self, false), _follow_up_hours, COALESCE(_is_active, true),
    auth.uid(), auth.uid()
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    reply_content = EXCLUDED.reply_content,
    status_after = EXCLUDED.status_after,
    priority_after = EXCLUDED.priority_after,
    assign_to_self = EXCLUDED.assign_to_self,
    follow_up_hours = EXCLUDED.follow_up_hours,
    is_active = EXCLUDED.is_active,
    updated_by = auth.uid()
  WHERE communication_macros.organization_id = _organization_id
  RETURNING communication_macros.id INTO saved_id;

  IF saved_id IS NULL THEN RAISE EXCEPTION 'MACRO_NOT_FOUND'; END IF;
  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (_organization_id, auth.uid(), 'communication.macro.saved', 'communication_macro',
          saved_id, jsonb_build_object('title', btrim(_title), 'is_active', COALESCE(_is_active, true)));
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_document_request_templates(_organization_id uuid)
RETURNS TABLE(id uuid, title text, items jsonb, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador']::public.app_role[])
  THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT template.id, template.title, template.items, template.is_active
    FROM public.document_request_templates AS template
   WHERE template.organization_id = _organization_id
   ORDER BY template.is_active DESC, template.title;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_document_request_template(
  _organization_id uuid,
  _template_id uuid,
  _title text,
  _items jsonb,
  _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE saved_id uuid; item jsonb;
BEGIN
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador']::public.app_role[])
  THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(COALESCE(_title, ''))) NOT BETWEEN 2 AND 80
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'DOCUMENT_TEMPLATE_INVALID';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    IF jsonb_typeof(item) <> 'object'
       OR char_length(btrim(COALESCE(item->>'title', ''))) NOT BETWEEN 2 AND 160
       OR char_length(COALESCE(item->>'description', '')) > 2000
       OR (item ? 'due_days' AND item->>'due_days' IS NOT NULL
           AND (item->>'due_days')::integer NOT BETWEEN 0 AND 365) THEN
      RAISE EXCEPTION 'DOCUMENT_TEMPLATE_ITEM_INVALID';
    END IF;
  END LOOP;

  INSERT INTO public.document_request_templates(
    id, organization_id, title, items, is_active, created_by, updated_by
  ) VALUES (
    COALESCE(_template_id, gen_random_uuid()), _organization_id, btrim(_title),
    _items, COALESCE(_is_active, true), auth.uid(), auth.uid()
  )
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, items = EXCLUDED.items,
    is_active = EXCLUDED.is_active, updated_by = auth.uid()
  WHERE document_request_templates.organization_id = _organization_id
  RETURNING document_request_templates.id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_TEMPLATE_NOT_FOUND'; END IF;
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_document_requests_from_template(
  _organization_id uuid,
  _client_id uuid,
  _template_id uuid,
  _process_id uuid DEFAULT NULL,
  _due_date date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE template_row public.document_request_templates%ROWTYPE; item jsonb; created_count integer := 0;
BEGIN
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador']::public.app_role[])
  THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO template_row FROM public.document_request_templates
   WHERE id = _template_id AND organization_id = _organization_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'DOCUMENT_TEMPLATE_NOT_FOUND'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(template_row.items)
  LOOP
    PERFORM public.create_client_portal_document_request(
      _organization_id, _client_id, _process_id, item->>'title',
      NULLIF(item->>'description', ''),
      COALESCE(_due_date,
        CASE WHEN item->>'due_days' IS NULL THEN NULL
             ELSE current_date + (item->>'due_days')::integer END)
    );
    created_count := created_count + 1;
  END LOOP;
  RETURN created_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_push_subscription(
  _organization_id uuid, _endpoint text, _p256dh text, _auth_key text, _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE saved_id uuid;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  IF char_length(COALESCE(_endpoint, '')) NOT BETWEEN 20 AND 2048
     OR char_length(COALESCE(_p256dh, '')) NOT BETWEEN 20 AND 512
     OR char_length(COALESCE(_auth_key, '')) NOT BETWEEN 8 AND 256 THEN
    RAISE EXCEPTION 'PUSH_SUBSCRIPTION_INVALID';
  END IF;
  INSERT INTO public.push_subscriptions(
    organization_id, user_id, endpoint, p256dh, auth_key, user_agent, is_active
  ) VALUES (
    _organization_id, auth.uid(), _endpoint, _p256dh, _auth_key,
    left(_user_agent, 500), true
  )
  ON CONFLICT (organization_id, user_id, endpoint) DO UPDATE SET
    p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key,
    user_agent = EXCLUDED.user_agent, is_active = true
  RETURNING id INTO saved_id;
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_push_subscription(
  _organization_id uuid, _endpoint text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  UPDATE public.push_subscriptions SET is_active = false
   WHERE organization_id = _organization_id AND user_id = auth.uid() AND endpoint = _endpoint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_communication_push(_thread_id uuid, _actor_id uuid)
RETURNS TABLE(subscription_id uuid, endpoint text, p256dh text, auth_key text,
              title text, body text, action_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE thread_row public.communication_threads%ROWTYPE; entry_row public.communication_entries%ROWTYPE;
BEGIN
  SELECT thread.* INTO thread_row
    FROM public.communication_threads thread
    JOIN public.client_portal_communication_shares share
      ON share.thread_id = thread.id AND share.organization_id = thread.organization_id AND share.is_shared
    JOIN public.client_portal_access access
      ON access.organization_id = thread.organization_id AND access.client_id = thread.client_id
     AND access.user_id = _actor_id AND access.is_active
   WHERE thread.id = _thread_id AND thread.archived_at IS NULL;
  IF NOT FOUND OR thread_row.assigned_to IS NULL THEN RETURN; END IF;

  SELECT entry.* INTO entry_row FROM public.communication_entries entry
   WHERE entry.thread_id = thread_row.id AND entry.organization_id = thread_row.organization_id
     AND entry.created_by = _actor_id AND entry.metadata->>'source' = 'client_portal'
     AND entry.created_at >= now() - interval '5 minutes'
   ORDER BY entry.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'PUSH_MESSAGE_NOT_ELIGIBLE' USING ERRCODE = '42501'; END IF;

  RETURN QUERY
  WITH claimed AS (
    INSERT INTO public.push_delivery_claims(entry_id, subscription_id)
    SELECT entry_row.id, subscription.id
      FROM public.push_subscriptions subscription
     WHERE subscription.organization_id = thread_row.organization_id
       AND subscription.user_id = thread_row.assigned_to AND subscription.is_active
    ON CONFLICT DO NOTHING
    RETURNING push_delivery_claims.subscription_id
  )
  SELECT subscription.id, subscription.endpoint, subscription.p256dh, subscription.auth_key,
         'Nova mensagem de cliente'::text, thread_row.subject,
         ('/comunicacao?thread=' || thread_row.id::text)::text
    FROM claimed JOIN public.push_subscriptions subscription ON subscription.id = claimed.subscription_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_push_test(_organization_id uuid, _actor_id uuid)
RETURNS TABLE(subscription_id uuid, endpoint text, p256dh text, auth_key text,
              title text, body text, action_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members member
    JOIN public.organizations organization ON organization.id = member.organization_id
    WHERE member.organization_id = _organization_id AND member.user_id = _actor_id
      AND member.is_active AND organization.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT subscription.id, subscription.endpoint, subscription.p256dh,
    subscription.auth_key, 'Alertas FLUXA ativados'::text,
    'Este aparelho receberá avisos de novas mensagens atribuídas a você.'::text,
    '/notificacoes'::text
  FROM public.push_subscriptions subscription
  WHERE subscription.organization_id = _organization_id
    AND subscription.user_id = _actor_id AND subscription.is_active;
END;
$function$;

-- Every public client message creates a durable internal bell notification.
CREATE OR REPLACE FUNCTION public.assign_client_portal_communication_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  thread_row public.communication_threads%ROWTYPE;
  selected_user_id uuid;
  was_auto_assigned boolean := false;
BEGIN
  IF NEW.entry_type::text <> 'mensagem' OR NEW.is_internal
     OR NEW.metadata->>'source' <> 'client_portal' THEN RETURN NEW; END IF;
  SELECT * INTO thread_row FROM public.communication_threads
   WHERE id = NEW.thread_id AND organization_id = NEW.organization_id AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  selected_user_id := thread_row.assigned_to;
  IF selected_user_id IS NULL THEN
    selected_user_id := public.select_portal_communication_assignee(thread_row.organization_id);
    IF selected_user_id IS NOT NULL THEN
      UPDATE public.communication_threads SET assigned_to = selected_user_id, updated_at = now()
       WHERE id = thread_row.id AND organization_id = thread_row.organization_id AND assigned_to IS NULL;
      IF FOUND THEN
        was_auto_assigned := true;
        INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
        VALUES (thread_row.organization_id, NULL, 'communication.assignee.auto_assigned',
                'communication_thread', thread_row.id,
                jsonb_build_object('assigned_to', selected_user_id, 'source', 'client_portal'));
      END IF;
    END IF;
  END IF;

  IF selected_user_id IS NOT NULL THEN
    INSERT INTO public.notifications(
      organization_id, user_id, title, body, kind, entity_type, entity_id, action_url, dedupe_key
    ) VALUES (
      thread_row.organization_id, selected_user_id, 'Nova mensagem de cliente',
      thread_row.subject, 'communication', 'comunicacao', thread_row.id, '/comunicacao',
      CASE WHEN was_auto_assigned
        THEN 'portal-auto-assignment:' || thread_row.id::text || ':' || selected_user_id::text
        ELSE 'portal-message:' || NEW.id::text || ':' || selected_user_id::text
      END
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_communication_macros(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_communication_macro(uuid, uuid, text, text, public.communication_status, public.communication_priority, boolean, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_document_request_templates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_document_request_template(uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_document_requests_from_template(uuid, uuid, uuid, uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_push_subscription(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_push_subscription(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prepare_communication_push(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_push_test(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_communication_macros(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_communication_macro(uuid, uuid, text, text, public.communication_status, public.communication_priority, boolean, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_document_request_templates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_document_request_template(uuid, uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_document_requests_from_template(uuid, uuid, uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_communication_push(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_push_test(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.assign_client_portal_communication_on_message()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_client_portal_communication_on_message() TO postgres;

INSERT INTO public.communication_macros(
  organization_id, title, reply_content, status_after, follow_up_hours, created_by, updated_by
)
SELECT organization.id, 'Confirmar recebimento e retornar',
       'Olá! Recebemos sua mensagem e nossa equipe já está verificando. Retornaremos assim que possível.',
       'aguardando_equipe', 24, organization.created_by, organization.created_by
FROM public.organizations organization
ON CONFLICT DO NOTHING;

INSERT INTO public.document_request_templates(
  organization_id, title, items, created_by, updated_by
)
SELECT organization.id, 'Cadastro básico',
       '[{"title":"Documento de identificação","description":"Envie um documento válido e legível.","due_days":7},{"title":"Comprovante de endereço atualizado","description":"Emitido nos últimos 90 dias.","due_days":7}]'::jsonb,
       organization.created_by, organization.created_by
FROM public.organizations organization
ON CONFLICT DO NOTHING;
