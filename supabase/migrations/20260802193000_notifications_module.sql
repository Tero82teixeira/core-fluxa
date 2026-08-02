-- Central de notificações: evolução aditiva da tabela existente.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_url text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_action_url_internal;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_action_url_internal
  CHECK (action_url IS NULL OR (action_url ~ '^/[^/]' AND action_url !~ E'\\\\')) NOT VALID;
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_organization_idx ON public.notifications(organization_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON public.notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_dedupe_idx ON public.notifications(dedupe_key);
DROP INDEX IF EXISTS public.notifications_org_dedupe_unique;
DROP INDEX IF EXISTS public.notifications_org_user_dedupe_unique;
CREATE UNIQUE INDEX notifications_org_user_dedupe_unique ON public.notifications(organization_id, user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id=notifications.organization_id AND m.user_id=auth.uid() AND m.is_active));
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated, anon;
GRANT SELECT ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 UPDATE public.notifications n SET read_at=coalesce(n.read_at,now()) WHERE n.id=_notification AND n.user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id=n.organization_id AND m.user_id=auth.uid() AND m.is_active);
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(_organization uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE affected integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_organization AND user_id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
 UPDATE public.notifications SET read_at=now() WHERE organization_id=_organization AND user_id=auth.uid() AND read_at IS NULL AND archived_at IS NULL; GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END $$;
CREATE OR REPLACE FUNCTION public.archive_notification(_notification uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 UPDATE public.notifications n SET archived_at=coalesce(n.archived_at,now()) WHERE n.id=_notification AND n.user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id=n.organization_id AND m.user_id=auth.uid() AND m.is_active);
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid), public.mark_all_notifications_read(uuid), public.archive_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid), public.mark_all_notifications_read(uuid), public.archive_notification(uuid) TO authenticated;

-- Trigger transacional, baseado exclusivamente nos responsáveis reais de cada tabela.
CREATE OR REPLACE FUNCTION public.notify_domain_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 n jsonb:=to_jsonb(NEW);
 o jsonb:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 recipient_text text; recipient uuid; k text; label text; url text; event text;
BEGIN
 CASE TG_TABLE_NAME
  WHEN 'tasks' THEN
   k:='task'; label:='Tarefa'; url:='/tarefas'; recipient_text:=n->>'assignee_id';
   event:=CASE WHEN TG_OP='INSERT' THEN 'assigned' WHEN n->>'assignee_id' IS DISTINCT FROM o->>'assignee_id' THEN 'reassigned' WHEN n->>'status' IS DISTINCT FROM o->>'status' THEN 'status' WHEN n->>'due_at' IS DISTINCT FROM o->>'due_at' THEN 'deadline' END;
  WHEN 'processes' THEN
   k:='process'; label:='Processo'; url:='/processos'; recipient_text:=n->>'owner_id';
   event:=CASE WHEN TG_OP='INSERT' THEN 'assigned' WHEN n->>'owner_id' IS DISTINCT FROM o->>'owner_id' THEN 'reassigned' WHEN n->>'stage' IS DISTINCT FROM o->>'stage' THEN 'status' WHEN n->>'due_date' IS DISTINCT FROM o->>'due_date' THEN 'deadline' END;
  WHEN 'monitoring_items' THEN
   k:='monitoring'; label:='Monitoramento'; url:='/monitoramento'; recipient_text:=n->>'responsible_user_id';
   event:=CASE WHEN TG_OP='INSERT' THEN 'assigned' WHEN n->>'responsible_user_id' IS DISTINCT FROM o->>'responsible_user_id' THEN 'reassigned' WHEN n->>'status' IS DISTINCT FROM o->>'status' THEN 'status' WHEN n->>'expiration_date' IS DISTINCT FROM o->>'expiration_date' THEN 'deadline' END;
  ELSE RETURN NEW;
 END CASE;
 -- A validação ocorre antes do cast: vazio, texto malformado e UUID nulo nunca são convertidos.
 IF recipient_text IS NULL OR recipient_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR event IS NULL THEN RETURN NEW; END IF;
 recipient:=recipient_text::uuid;
 IF recipient=auth.uid() THEN RETURN NEW; END IF;
 INSERT INTO public.notifications(organization_id,user_id,kind,title,body,entity_type,entity_id,action_url,dedupe_key)
 VALUES ((n->>'organization_id')::uuid,recipient,k,label||' atualizada',coalesce(n->>'title',n->>'code',label)||' requer sua atenção.',k,(n->>'id')::uuid,url,k||':'||(n->>'id')||':'||event||':'||coalesce(n->>'updated_at',n->>'created_at')) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_domain_change() FROM PUBLIC, anon, authenticated;
-- Documents possui autoria/revisão concluída, mas não um responsável ou revisor designado; não se inventa destinatário.
DO $$ DECLARE t text; BEGIN
 DROP TRIGGER IF EXISTS notify_domain_change ON public.documents;
 FOREACH t IN ARRAY ARRAY['tasks','processes','monitoring_items'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('DROP TRIGGER IF EXISTS notify_domain_change ON public.%I',t); EXECUTE format('CREATE TRIGGER notify_domain_change AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.notify_domain_change()',t); END IF;
 END LOOP;
END $$;
