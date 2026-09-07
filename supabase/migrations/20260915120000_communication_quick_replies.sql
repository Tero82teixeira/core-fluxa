-- Organization-scoped, human-reviewed quick replies for client communication.

CREATE TABLE public.communication_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 2 AND 2000),
  category text NOT NULL DEFAULT 'Geral' CHECK (char_length(btrim(category)) BETWEEN 2 AND 40),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX communication_quick_replies_org_title_idx
  ON public.communication_quick_replies (organization_id, lower(title));
CREATE INDEX communication_quick_replies_org_active_idx
  ON public.communication_quick_replies (organization_id, is_active, category, title);

CREATE TRIGGER communication_quick_replies_updated_at
  BEFORE UPDATE ON public.communication_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.communication_quick_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.communication_quick_replies FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_communication_quick_replies(
  _organization_id uuid
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  category text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);

  RETURN QUERY
  SELECT reply.id, reply.title, reply.content, reply.category, reply.is_active,
         reply.created_at, reply.updated_at
    FROM public.communication_quick_replies AS reply
   WHERE reply.organization_id = _organization_id
   ORDER BY reply.is_active DESC, reply.category, reply.title;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_communication_quick_reply(
  _organization_id uuid,
  _reply_id uuid,
  _title text,
  _content text,
  _category text DEFAULT 'Geral',
  _is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  saved_id uuid;
  action_name text;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);

  IF char_length(btrim(COALESCE(_title, ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'QUICK_REPLY_TITLE_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(_content, ''))) NOT BETWEEN 2 AND 2000 THEN
    RAISE EXCEPTION 'QUICK_REPLY_CONTENT_INVALID';
  END IF;
  IF char_length(btrim(COALESCE(_category, ''))) NOT BETWEEN 2 AND 40 THEN
    RAISE EXCEPTION 'QUICK_REPLY_CATEGORY_INVALID';
  END IF;

  IF _reply_id IS NULL THEN
    INSERT INTO public.communication_quick_replies (
      organization_id, title, content, category, is_active, created_by, updated_by
    ) VALUES (
      _organization_id, btrim(_title), btrim(_content), btrim(_category),
      COALESCE(_is_active, true), auth.uid(), auth.uid()
    ) RETURNING id INTO saved_id;
    action_name := 'communication.quick_reply.created';
  ELSE
    UPDATE public.communication_quick_replies AS reply
       SET title = btrim(_title),
           content = btrim(_content),
           category = btrim(_category),
           is_active = COALESCE(_is_active, true),
           updated_by = auth.uid()
     WHERE reply.id = _reply_id
       AND reply.organization_id = _organization_id
     RETURNING reply.id INTO saved_id;

    IF saved_id IS NULL THEN
      RAISE EXCEPTION 'QUICK_REPLY_NOT_FOUND';
    END IF;
    action_name := 'communication.quick_reply.updated';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), action_name, 'communication_quick_reply', saved_id,
    jsonb_build_object('title', btrim(_title), 'category', btrim(_category),
      'is_active', COALESCE(_is_active, true))
  );

  RETURN saved_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_communication_quick_replies(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_communication_quick_reply(uuid, uuid, text, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_communication_quick_replies(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_communication_quick_reply(uuid, uuid, text, text, text, boolean)
  TO authenticated;

INSERT INTO public.communication_quick_replies (
  organization_id, title, content, category, created_by, updated_by
)
SELECT organization.id, seed.title, seed.content, seed.category,
       organization.created_by, organization.created_by
  FROM public.organizations AS organization
 CROSS JOIN (VALUES
   ('Recebimento confirmado', 'Olá! Recebemos sua mensagem e nossa equipe já está verificando. Retornaremos assim que possível.', 'Atendimento'),
   ('Documento em análise', 'Olá! O documento enviado foi recebido e está em análise. Avisaremos assim que a conferência for concluída.', 'Documentos'),
   ('Solicitar documento', 'Olá! Para continuarmos o atendimento, precisamos que envie o documento solicitado pelo Meu Portal.', 'Documentos'),
   ('Atendimento atualizado', 'Olá! Seu atendimento foi atualizado. Caso precise de algo mais, estamos à disposição.', 'Atendimento')
 ) AS seed(title, content, category)
ON CONFLICT DO NOTHING;
