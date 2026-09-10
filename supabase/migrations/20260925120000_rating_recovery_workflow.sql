-- Turns low client ratings into a visible, auditable recovery workflow.

ALTER TABLE public.client_portal_communication_ratings
  ADD COLUMN recovery_status text NOT NULL DEFAULT 'nao_necessaria'
    CHECK (recovery_status IN ('nova', 'em_contato', 'resolvida', 'nao_necessaria')),
  ADD COLUMN recovery_notes text
    CHECK (recovery_notes IS NULL OR char_length(recovery_notes) <= 1000),
  ADD COLUMN recovery_handled_by uuid,
  ADD COLUMN recovery_handled_at timestamptz;

UPDATE public.client_portal_communication_ratings
   SET recovery_status = CASE WHEN rating <= 3 THEN 'nova' ELSE 'nao_necessaria' END;

CREATE INDEX client_portal_ratings_recovery_idx
  ON public.client_portal_communication_ratings(organization_id, recovery_status, created_at DESC)
  WHERE recovery_status IN ('nova', 'em_contato');

CREATE OR REPLACE FUNCTION public.reset_client_portal_rating_recovery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.rating IS DISTINCT FROM OLD.rating THEN
    NEW.recovery_status := CASE WHEN NEW.rating <= 3 THEN 'nova' ELSE 'nao_necessaria' END;
    NEW.recovery_notes := NULL;
    NEW.recovery_handled_by := NULL;
    NEW.recovery_handled_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER client_portal_rating_recovery_reset
  BEFORE INSERT OR UPDATE OF rating ON public.client_portal_communication_ratings
  FOR EACH ROW EXECUTE FUNCTION public.reset_client_portal_rating_recovery();

CREATE OR REPLACE FUNCTION public.notify_client_portal_rating_attention()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.rating > 3 OR (TG_OP = 'UPDATE' AND NEW.rating IS NOT DISTINCT FROM OLD.rating) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  )
  SELECT NEW.organization_id,
         member.user_id,
         CASE WHEN NEW.rating <= 2 THEN 'Avaliação baixa recebida'
              ELSE 'Avaliação requer atenção' END,
         format('%s avaliou o atendimento com %s de 5 estrelas.', client.name, NEW.rating),
         'communication',
         'client_portal_rating',
         NEW.id,
         '/relatorios?tipo=service',
         'portal-rating:' || NEW.id::text || ':' || NEW.rating::text || ':' || member.user_id::text
    FROM public.communication_threads AS thread
    JOIN public.clients AS client
      ON client.organization_id = NEW.organization_id AND client.id = NEW.client_id
    JOIN public.organization_members AS member
      ON member.organization_id = NEW.organization_id
     AND member.is_active
     AND (
       member.role::text IN ('superadmin', 'proprietario', 'administrador', 'gestor')
       OR member.user_id = thread.assigned_to
     )
   WHERE thread.organization_id = NEW.organization_id
     AND thread.client_id = NEW.client_id
     AND thread.id = NEW.thread_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER client_portal_rating_attention_notification
  AFTER INSERT OR UPDATE OF rating ON public.client_portal_communication_ratings
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_portal_rating_attention();

DROP FUNCTION public.list_staff_client_portal_communication_ratings(uuid,timestamptz,timestamptz);
CREATE FUNCTION public.list_staff_client_portal_communication_ratings(
  _organization_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE (
  rating_id uuid,
  client_id uuid,
  client_name text,
  thread_id uuid,
  subject text,
  rating smallint,
  comment text,
  recovery_status text,
  recovery_notes text,
  recovery_handled_by uuid,
  recovery_handled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  IF _from IS NULL OR _to IS NULL OR _from > _to OR _to - _from > interval '370 days' THEN
    RAISE EXCEPTION 'REPORT_PERIOD_INVALID';
  END IF;
  RETURN QUERY
  SELECT rating_row.id, rating_row.client_id, client.name, rating_row.thread_id,
         thread.subject, rating_row.rating, rating_row.comment,
         rating_row.recovery_status, rating_row.recovery_notes,
         rating_row.recovery_handled_by, rating_row.recovery_handled_at,
         rating_row.created_at, rating_row.updated_at
    FROM public.client_portal_communication_ratings AS rating_row
    JOIN public.clients AS client
      ON client.organization_id = rating_row.organization_id AND client.id = rating_row.client_id
    JOIN public.communication_threads AS thread
      ON thread.organization_id = rating_row.organization_id
     AND thread.client_id = rating_row.client_id AND thread.id = rating_row.thread_id
   WHERE rating_row.organization_id = _organization_id
     AND rating_row.created_at >= _from AND rating_row.created_at < _to + interval '1 day'
   ORDER BY rating_row.created_at DESC, rating_row.id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_staff_client_portal_rating_recovery(
  _organization_id uuid,
  _rating_id uuid,
  _status text,
  _notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE rating_row public.client_portal_communication_ratings%ROWTYPE;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  IF _status NOT IN ('nova', 'em_contato', 'resolvida') THEN
    RAISE EXCEPTION 'RATING_RECOVERY_STATUS_INVALID';
  END IF;
  IF char_length(COALESCE(_notes, '')) > 1000 THEN
    RAISE EXCEPTION 'RATING_RECOVERY_NOTES_INVALID';
  END IF;
  SELECT * INTO rating_row
    FROM public.client_portal_communication_ratings
   WHERE id = _rating_id AND organization_id = _organization_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RATING_NOT_FOUND'; END IF;
  IF rating_row.rating > 3 THEN RAISE EXCEPTION 'RATING_RECOVERY_NOT_REQUIRED'; END IF;

  UPDATE public.client_portal_communication_ratings
     SET recovery_status = _status,
         recovery_notes = NULLIF(btrim(COALESCE(_notes, '')), ''),
         recovery_handled_by = CASE WHEN _status = 'nova' THEN NULL ELSE auth.uid() END,
         recovery_handled_at = CASE WHEN _status = 'resolvida' THEN now() ELSE NULL END
   WHERE id = rating_row.id;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (_organization_id, auth.uid(), 'client_portal.rating_recovery.' || _status,
    'client_portal_communication_rating', rating_row.id,
    jsonb_build_object('from', rating_row.recovery_status, 'to', _status));
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_client_portal_rating_recovery(),
  public.notify_client_portal_rating_attention(),
  public.list_staff_client_portal_communication_ratings(uuid,timestamptz,timestamptz),
  public.update_staff_client_portal_rating_recovery(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff_client_portal_communication_ratings(uuid,timestamptz,timestamptz),
  public.update_staff_client_portal_rating_recovery(uuid,uuid,text,text)
  TO authenticated;
