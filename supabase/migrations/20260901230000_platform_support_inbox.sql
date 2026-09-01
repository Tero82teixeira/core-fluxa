-- Connect customer support requests to the FLUXA platform administration.
-- Browser sessions never receive unrestricted table access: platform-wide
-- reads and every reply go through permission-checked RPCs.

BEGIN;

CREATE TABLE public.support_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL
    REFERENCES public.support_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_kind text NOT NULL
    CHECK (author_kind IN ('customer', 'platform')),
  message text NOT NULL
    CHECK (length(btrim(message)) BETWEEN 2 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_request_messages_request_created_idx
  ON public.support_request_messages(request_id, created_at);
CREATE INDEX support_request_messages_org_created_idx
  ON public.support_request_messages(organization_id, created_at DESC);

ALTER TABLE public.support_request_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_request_messages
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_request_messages TO service_role;

CREATE OR REPLACE FUNCTION public.support_assert_admin(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.is_platform_admin()
    AND NOT public.has_org_role(
      _org,
      ARRAY['superadmin', 'proprietario', 'administrador', 'gestor']::public.app_role[]
    )
  ) THEN
    RAISE EXCEPTION 'SUPPORT_ADMIN_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_support_requests(
  _status text DEFAULT NULL,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  organization_name text,
  created_by uuid,
  requester_name text,
  requester_email text,
  subject text,
  category text,
  description text,
  priority text,
  status text,
  related_module text,
  related_route text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  reply_count bigint,
  last_reply_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN (
    'aberto', 'em_analise', 'aguardando_usuario', 'resolvido', 'arquivado'
  ) THEN
    RAISE EXCEPTION 'SUPPORT_INVALID_STATUS' USING ERRCODE = '22023';
  END IF;
  IF _limit IS NULL OR _limit < 1 OR _limit > 200 THEN
    RAISE EXCEPTION 'INVALID_SUPPORT_LIMIT' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT request.id,
         request.organization_id,
         COALESCE(organization.trade_name, organization.legal_name),
         request.created_by,
         COALESCE(profile.full_name, 'Usuário FLUXA'),
         profile.email,
         request.subject,
         request.category,
         request.description,
         request.priority,
         request.status,
         request.related_module,
         request.related_route,
         request.created_at,
         request.updated_at,
         request.resolved_at,
         count(message.id),
         max(message.created_at)
    FROM public.support_requests request
    JOIN public.organizations organization
      ON organization.id = request.organization_id
    LEFT JOIN public.profiles profile
      ON profile.id = request.created_by
    LEFT JOIN public.support_request_messages message
      ON message.request_id = request.id
   WHERE (_status IS NULL OR request.status = _status)
   GROUP BY request.id,
            organization.trade_name,
            organization.legal_name,
            profile.full_name,
            profile.email
   ORDER BY request.updated_at DESC, request.id DESC
   LIMIT _limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_support_open_count()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT count(*)
      FROM public.support_requests request
     WHERE request.status IN ('aberto', 'em_analise')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.support_request_thread(_request_id uuid)
RETURNS TABLE (
  id uuid,
  author_kind text,
  author_name text,
  message text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  request public.support_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  SELECT support.*
    INTO request
    FROM public.support_requests support
   WHERE support.id = _request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_platform_admin()
     AND request.created_by <> auth.uid()
     AND NOT public.has_org_role(
       request.organization_id,
       ARRAY['superadmin', 'proprietario', 'administrador', 'gestor']::public.app_role[]
     )
  THEN
    RAISE EXCEPTION 'SUPPORT_REQUEST_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT response.id,
         response.author_kind,
         CASE
           WHEN response.author_kind = 'platform' THEN 'Equipe FLUXA'
           ELSE COALESCE(profile.full_name, 'Usuário')
         END,
         response.message,
         response.created_at
    FROM public.support_request_messages response
    LEFT JOIN public.profiles profile ON profile.id = response.author_id
   WHERE response.request_id = _request_id
   ORDER BY response.created_at, response.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reply_support_request(
  _request_id uuid,
  _message text,
  _next_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  request public.support_requests%ROWTYPE;
  response_id uuid;
  platform_author boolean;
  effective_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF _message IS NULL OR length(btrim(_message)) NOT BETWEEN 2 AND 5000 THEN
    RAISE EXCEPTION 'SUPPORT_INVALID_MESSAGE' USING ERRCODE = '22023';
  END IF;

  SELECT support.*
    INTO request
    FROM public.support_requests support
   WHERE support.id = _request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPORT_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF request.status = 'arquivado' THEN
    RAISE EXCEPTION 'SUPPORT_REQUEST_ARCHIVED' USING ERRCODE = '55000';
  END IF;

  platform_author := public.is_platform_admin();
  IF NOT platform_author
     AND request.created_by <> auth.uid()
     AND NOT public.has_org_role(
       request.organization_id,
       ARRAY['superadmin', 'proprietario', 'administrador', 'gestor']::public.app_role[]
     )
  THEN
    RAISE EXCEPTION 'SUPPORT_REQUEST_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF platform_author THEN
    effective_status := COALESCE(_next_status, 'aguardando_usuario');
    IF effective_status NOT IN ('em_analise', 'aguardando_usuario', 'resolvido') THEN
      RAISE EXCEPTION 'SUPPORT_INVALID_STATUS' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF _next_status IS NOT NULL THEN
      RAISE EXCEPTION 'SUPPORT_STATUS_PLATFORM_ONLY' USING ERRCODE = '42501';
    END IF;
    effective_status := 'em_analise';
  END IF;

  INSERT INTO public.support_request_messages(
    request_id,
    organization_id,
    author_id,
    author_kind,
    message
  ) VALUES (
    request.id,
    request.organization_id,
    auth.uid(),
    CASE WHEN platform_author THEN 'platform' ELSE 'customer' END,
    btrim(_message)
  ) RETURNING id INTO response_id;

  UPDATE public.support_requests
     SET status = effective_status,
         updated_at = now(),
         resolved_at = CASE WHEN effective_status = 'resolvido' THEN now() ELSE NULL END
   WHERE id = request.id;

  IF platform_author THEN
    INSERT INTO public.notifications(
      organization_id,
      user_id,
      title,
      body,
      kind,
      action_url,
      entity_type,
      entity_id,
      dedupe_key
    ) VALUES (
      request.organization_id,
      request.created_by,
      'Nova resposta do suporte FLUXA',
      request.subject,
      'info',
      '/ajuda',
      'support_request',
      request.id,
      'support-reply:' || response_id::text
    );
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    request.organization_id,
    auth.uid(),
    CASE
      WHEN platform_author THEN 'support.request.platform_replied'
      ELSE 'support.request.customer_replied'
    END,
    'support_request',
    request.id,
    jsonb_build_object('status', effective_status)
  );

  RETURN response_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_support_requests(text, integer)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.platform_support_open_count()
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.support_request_thread(uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reply_support_request(uuid, text, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.platform_support_requests(text, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_open_count()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_request_thread(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_support_request(uuid, text, text)
  TO authenticated;

COMMIT;
