-- Central interna de comunicação. Não envia mensagens nem depende de integrações externas.
DO $$ BEGIN
  CREATE TYPE public.communication_status AS ENUM ('aberta','aguardando_cliente','aguardando_equipe','resolvida','arquivada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.communication_priority AS ENUM ('baixa','normal','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.communication_channel AS ENUM ('whatsapp','telefone','email','presencial','interno','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.communication_entry_type AS ENUM ('mensagem','nota_interna','ligacao','email','whatsapp','reuniao','outro','status','lembrete','anexo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.communication_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 240),
  channel public.communication_channel NOT NULL DEFAULT 'interno',
  status public.communication_status NOT NULL DEFAULT 'aberta',
  priority public.communication_priority NOT NULL DEFAULT 'normal',
  assigned_to uuid,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  follow_up_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.communication_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.communication_threads(id) ON DELETE RESTRICT,
  entry_type public.communication_entry_type NOT NULL,
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 10000),
  created_by uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  is_internal boolean NOT NULL DEFAULT false,
  contact_made boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communication_threads_org_updated_idx ON public.communication_threads (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS communication_threads_org_status_idx ON public.communication_threads (organization_id, status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS communication_threads_follow_up_idx ON public.communication_threads (organization_id, follow_up_at) WHERE follow_up_at IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS communication_entries_thread_idx ON public.communication_entries (thread_id, occurred_at, created_at);
CREATE INDEX IF NOT EXISTS communication_entries_search_idx ON public.communication_entries USING gin (to_tsvector('portuguese', content));

CREATE OR REPLACE FUNCTION public.communication_validate_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN RAISE EXCEPTION 'COMMUNICATION_ORGANIZATION_IMMUTABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=NEW.client_id AND c.organization_id=NEW.organization_id AND c.archived_at IS NULL) THEN RAISE EXCEPTION 'COMMUNICATION_CLIENT_ORG_MISMATCH'; END IF;
  IF NEW.process_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.processes p WHERE p.id=NEW.process_id AND p.organization_id=NEW.organization_id AND p.client_id=NEW.client_id) THEN RAISE EXCEPTION 'COMMUNICATION_PROCESS_ORG_MISMATCH'; END IF;
  IF NEW.task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.id=NEW.task_id AND t.organization_id=NEW.organization_id AND (t.client_id IS NULL OR t.client_id=NEW.client_id)) THEN RAISE EXCEPTION 'COMMUNICATION_TASK_ORG_MISMATCH'; END IF;
  IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.assigned_to AND m.is_active) THEN RAISE EXCEPTION 'COMMUNICATION_ASSIGNEE_NOT_MEMBER'; END IF;
  NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.communication_entry_validate_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.communication_threads t WHERE t.id=NEW.thread_id AND t.organization_id=NEW.organization_id) THEN RAISE EXCEPTION 'COMMUNICATION_ENTRY_ORG_MISMATCH'; END IF;
  IF NEW.entry_type='nota_interna' THEN NEW.is_internal := true; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS communication_validate_links_trg ON public.communication_threads;
CREATE TRIGGER communication_validate_links_trg BEFORE INSERT OR UPDATE ON public.communication_threads FOR EACH ROW EXECUTE FUNCTION public.communication_validate_links();
DROP TRIGGER IF EXISTS communication_entry_validate_scope_trg ON public.communication_entries;
CREATE TRIGGER communication_entry_validate_scope_trg BEFORE INSERT OR UPDATE ON public.communication_entries FOR EACH ROW EXECUTE FUNCTION public.communication_entry_validate_scope();

ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY communication_threads_select ON public.communication_threads FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY communication_entries_select ON public.communication_entries FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
-- Escritas são exclusivamente pelas RPCs abaixo; nenhuma policy INSERT/UPDATE/DELETE.
REVOKE ALL ON public.communication_threads, public.communication_entries FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.communication_threads, public.communication_entries FROM authenticated;
GRANT SELECT ON public.communication_threads, public.communication_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.communication_assert_role(_org uuid, _administrative boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF _administrative THEN
    IF NOT public.has_org_role(_org, ARRAY['proprietario','administrador','gestor']::public.app_role[]) THEN RAISE EXCEPTION 'COMMUNICATION_ADMIN_PERMISSION_DENIED'; END IF;
  ELSIF NOT public.has_org_role(_org, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]) THEN
    RAISE EXCEPTION 'COMMUNICATION_WRITE_PERMISSION_DENIED';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_communication_thread(_organization_id uuid, _client_id uuid, _subject text, _channel public.communication_channel DEFAULT 'interno', _assigned_to uuid DEFAULT NULL, _priority public.communication_priority DEFAULT 'normal', _process_id uuid DEFAULT NULL, _task_id uuid DEFAULT NULL, _first_content text DEFAULT NULL, _follow_up_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.communication_assert_role(_organization_id, false);
  INSERT INTO public.communication_threads(organization_id,client_id,subject,channel,assigned_to,priority,process_id,task_id,follow_up_at,created_by)
  VALUES(_organization_id,_client_id,btrim(_subject),_channel,_assigned_to,_priority,_process_id,_task_id,_follow_up_at,auth.uid()) RETURNING id INTO v_id;
  IF nullif(btrim(_first_content),'') IS NOT NULL THEN INSERT INTO public.communication_entries(organization_id,thread_id,entry_type,content,created_by,is_internal) VALUES(_organization_id,v_id,'mensagem',btrim(_first_content),auth.uid(),false); END IF;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'communication.thread.created','communication_thread',v_id,jsonb_build_object('subject',_subject));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.add_communication_entry(_thread_id uuid, _entry_type public.communication_entry_type, _content text, _occurred_at timestamptz DEFAULT now(), _is_internal boolean DEFAULT false, _contact_made boolean DEFAULT false, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thread public.communication_threads%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO v_thread FROM public.communication_threads WHERE id=_thread_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND'; END IF;
  PERFORM public.communication_assert_role(v_thread.organization_id, false);
  INSERT INTO public.communication_entries(organization_id,thread_id,entry_type,content,created_by,occurred_at,is_internal,contact_made,metadata)
  VALUES(v_thread.organization_id,_thread_id,_entry_type,btrim(_content),auth.uid(),coalesce(_occurred_at,now()),_is_internal OR _entry_type='nota_interna',_contact_made,coalesce(_metadata,'{}')) RETURNING id INTO v_id;
  UPDATE public.communication_threads SET updated_at=now() WHERE id=_thread_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v_thread.organization_id,auth.uid(),'communication.entry.added','communication_thread',_thread_id,jsonb_build_object('entry_id',v_id,'type',_entry_type));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_communication_thread(_thread_id uuid, _subject text DEFAULT NULL, _channel public.communication_channel DEFAULT NULL, _priority public.communication_priority DEFAULT NULL, _process_id uuid DEFAULT NULL, _task_id uuid DEFAULT NULL, _follow_up_at timestamptz DEFAULT NULL, _clear_follow_up boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thread public.communication_threads%ROWTYPE;
BEGIN
 SELECT * INTO v_thread FROM public.communication_threads WHERE id=_thread_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND'; END IF;
 PERFORM public.communication_assert_role(v_thread.organization_id, false);
 UPDATE public.communication_threads SET subject=coalesce(nullif(btrim(_subject),''),subject),channel=coalesce(_channel,channel),priority=coalesce(_priority,priority),process_id=coalesce(_process_id,process_id),task_id=coalesce(_task_id,task_id),follow_up_at=CASE WHEN _clear_follow_up THEN NULL ELSE coalesce(_follow_up_at,follow_up_at) END WHERE id=_thread_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id) VALUES(v_thread.organization_id,auth.uid(),'communication.thread.updated','communication_thread',_thread_id);
END $$;

CREATE OR REPLACE FUNCTION public.change_communication_thread_status(_thread_id uuid, _status public.communication_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thread public.communication_threads%ROWTYPE;
BEGIN
 SELECT * INTO v_thread FROM public.communication_threads WHERE id=_thread_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND'; END IF;
 PERFORM public.communication_assert_role(v_thread.organization_id, _status='arquivada');
 IF _status='aberta' AND v_thread.status NOT IN ('resolvida','aguardando_cliente','aguardando_equipe') THEN RAISE EXCEPTION 'COMMUNICATION_INVALID_REOPEN'; END IF;
 UPDATE public.communication_threads SET status=_status,archived_at=CASE WHEN _status='arquivada' THEN now() ELSE NULL END WHERE id=_thread_id;
 INSERT INTO public.communication_entries(organization_id,thread_id,entry_type,content,created_by,is_internal,metadata) VALUES(v_thread.organization_id,_thread_id,'status','Status alterado para '||_status,auth.uid(),true,jsonb_build_object('from',v_thread.status,'to',_status));
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v_thread.organization_id,auth.uid(),'communication.status.changed','communication_thread',_thread_id,jsonb_build_object('from',v_thread.status,'to',_status));
END $$;

CREATE OR REPLACE FUNCTION public.assign_communication_thread(_thread_id uuid, _assigned_to uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thread public.communication_threads%ROWTYPE;
BEGIN SELECT * INTO v_thread FROM public.communication_threads WHERE id=_thread_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'COMMUNICATION_THREAD_NOT_FOUND'; END IF; PERFORM public.communication_assert_role(v_thread.organization_id,true);
 UPDATE public.communication_threads SET assigned_to=_assigned_to WHERE id=_thread_id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(v_thread.organization_id,auth.uid(),'communication.assignee.changed','communication_thread',_thread_id,jsonb_build_object('from',v_thread.assigned_to,'to',_assigned_to)); END $$;
CREATE OR REPLACE FUNCTION public.archive_communication_thread(_thread_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.change_communication_thread_status(_thread_id,'arquivada') $$;

REVOKE ALL ON FUNCTION public.communication_assert_role(uuid,boolean), public.create_communication_thread(uuid,uuid,text,public.communication_channel,uuid,public.communication_priority,uuid,uuid,text,timestamptz), public.add_communication_entry(uuid,public.communication_entry_type,text,timestamptz,boolean,boolean,jsonb), public.update_communication_thread(uuid,text,public.communication_channel,public.communication_priority,uuid,uuid,timestamptz,boolean), public.change_communication_thread_status(uuid,public.communication_status), public.assign_communication_thread(uuid,uuid), public.archive_communication_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_communication_thread(uuid,uuid,text,public.communication_channel,uuid,public.communication_priority,uuid,uuid,text,timestamptz), public.add_communication_entry(uuid,public.communication_entry_type,text,timestamptz,boolean,boolean,jsonb), public.update_communication_thread(uuid,text,public.communication_channel,public.communication_priority,uuid,uuid,timestamptz,boolean), public.change_communication_thread_status(uuid,public.communication_status), public.assign_communication_thread(uuid,uuid), public.archive_communication_thread(uuid) TO authenticated;
