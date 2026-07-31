
-- ============ 1. TASKS COLUMNS ============
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS due_time time,
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monitoring_item_id uuid REFERENCES public.monitoring_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_recurrence_type_check
    CHECK (recurrence_type IN ('none','daily','weekly','monthly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 2. LINK VALIDATION TRIGGER ============
CREATE OR REPLACE FUNCTION public.tasks_enforce_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_process public.processes%ROWTYPE;
  v_doc public.documents%ROWTYPE;
  v_mon public.monitoring_items%ROWTYPE;
  v_org uuid;
BEGIN
  IF NEW.monitoring_item_id IS NOT NULL THEN
    SELECT * INTO v_mon FROM public.monitoring_items WHERE id = NEW.monitoring_item_id;
    IF NOT FOUND OR v_mon.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'TASK_MONITORING_ORG_MISMATCH';
    END IF;
    NEW.client_id := COALESCE(NEW.client_id, v_mon.client_id);
    NEW.process_id := COALESCE(NEW.process_id, v_mon.process_id);
  END IF;

  IF NEW.document_id IS NOT NULL THEN
    SELECT * INTO v_doc FROM public.documents WHERE id = NEW.document_id;
    IF NOT FOUND OR v_doc.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'TASK_DOCUMENT_ORG_MISMATCH';
    END IF;
    NEW.client_id := COALESCE(NEW.client_id, v_doc.client_id);
    NEW.process_id := COALESCE(NEW.process_id, v_doc.process_id);
  END IF;

  IF NEW.process_id IS NOT NULL THEN
    SELECT * INTO v_process FROM public.processes WHERE id = NEW.process_id;
    IF NOT FOUND OR v_process.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'TASK_PROCESS_ORG_MISMATCH';
    END IF;
    IF NEW.client_id IS NULL THEN
      NEW.client_id := v_process.client_id;
    ELSIF NEW.client_id <> v_process.client_id THEN
      RAISE EXCEPTION 'TASK_CLIENT_PROCESS_MISMATCH';
    END IF;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.clients WHERE id = NEW.client_id;
    IF v_org IS NULL OR v_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'TASK_CLIENT_ORG_MISMATCH';
    END IF;
  END IF;

  IF NEW.assignee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = NEW.assignee_id AND m.organization_id = NEW.organization_id AND m.is_active
    ) THEN
      RAISE EXCEPTION 'TASK_ASSIGNEE_NOT_MEMBER';
    END IF;
  END IF;

  IF NEW.start_date IS NOT NULL AND NEW.due_at IS NOT NULL AND NEW.due_at::date < NEW.start_date THEN
    RAISE EXCEPTION 'TASK_DUE_BEFORE_START';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tasks_enforce_links_trg ON public.tasks;
CREATE TRIGGER tasks_enforce_links_trg BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_enforce_links();

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3. TASK COMMENTS ============
CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid,
  user_name text,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_comments_select ON public.task_comments;
CREATE POLICY task_comments_select ON public.task_comments FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS task_comments_insert ON public.task_comments;
CREATE POLICY task_comments_insert ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::app_role[])
  );
DROP POLICY IF EXISTS task_comments_update_own ON public.task_comments;
CREATE POLICY task_comments_update_own ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['proprietario','administrador']::app_role[]))
  WITH CHECK (public.is_org_member(organization_id));

DROP TRIGGER IF EXISTS task_comments_set_updated_at ON public.task_comments;
CREATE TRIGGER task_comments_set_updated_at BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 4. TASK HISTORY ============
CREATE TABLE IF NOT EXISTS public.task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid,
  user_name text,
  action text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.task_history TO authenticated;
GRANT ALL ON public.task_history TO service_role;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_history_select ON public.task_history;
CREATE POLICY task_history_select ON public.task_history FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS task_history_insert ON public.task_history;
CREATE POLICY task_history_insert ON public.task_history FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND (user_id IS NULL OR user_id = auth.uid()));

-- ============ 5. INVITATIONS ============
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'operacional',
  status text NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL,
  invited_by uuid,
  invited_by_name text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_invitations_status_check CHECK (status IN ('pending','accepted','expired','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_unique
  ON public.organization_invitations (organization_id, lower(email)) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_token_hash_key
  ON public.organization_invitations (token_hash);

GRANT SELECT ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_select_admin ON public.organization_invitations;
CREATE POLICY invitations_select_admin ON public.organization_invitations FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::app_role[]));

REVOKE SELECT (token_hash) ON public.organization_invitations FROM authenticated;

DROP TRIGGER IF EXISTS organization_invitations_set_updated_at ON public.organization_invitations;
CREATE TRIGGER organization_invitations_set_updated_at BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 6. SECURE RPCs ============
CREATE OR REPLACE FUNCTION public.create_invitation(_org uuid, _email text, _role app_role)
RETURNS TABLE(invitation_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE
  v_token text;
  v_hash text;
  v_email text := lower(trim(_email));
  v_id uuid;
  v_exp timestamptz := now() + interval '7 days';
  v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT public.has_org_role(_org, ARRAY['proprietario','administrador']::app_role[]) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _role NOT IN ('administrador','operacional','visualizador') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;
  IF _role = 'administrador' AND NOT public.has_org_role(_org, ARRAY['proprietario']::app_role[]) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;

  UPDATE public.organization_invitations
     SET status = 'expired'
   WHERE organization_id = _org AND status = 'pending' AND expires_at < now();

  SELECT full_name INTO v_actor FROM public.profiles WHERE id = auth.uid();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.organization_invitations AS i
    (organization_id, email, role, token_hash, invited_by, invited_by_name, expires_at)
  VALUES (_org, v_email, _role, v_hash, auth.uid(), v_actor, v_exp)
  ON CONFLICT (organization_id, lower(email)) WHERE status = 'pending'
  DO UPDATE SET role = EXCLUDED.role, token_hash = EXCLUDED.token_hash,
                invited_by = EXCLUDED.invited_by, invited_by_name = EXCLUDED.invited_by_name,
                expires_at = EXCLUDED.expires_at, updated_at = now()
  RETURNING i.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, v_exp;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_invitation(_invitation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.organization_invitations WHERE id = _invitation;
  IF v_org IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  IF NOT public.has_org_role(v_org, ARRAY['proprietario','administrador']::app_role[]) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.organization_invitations
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = _invitation AND status = 'pending';
END; $$;

CREATE OR REPLACE FUNCTION public.invitation_preview(_token text)
RETURNS TABLE(organization_name text, email text, role app_role, status text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_hash text := encode(extensions.digest(_token, 'sha256'), 'hex');
BEGIN
  RETURN QUERY
  SELECT COALESCE(o.trade_name, o.legal_name), i.email, i.role,
         CASE WHEN i.status = 'pending' AND i.expires_at < now() THEN 'expired' ELSE i.status END,
         i.expires_at
    FROM public.organization_invitations i
    JOIN public.organizations o ON o.id = i.organization_id
   WHERE i.token_hash = v_hash;
END; $$;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS TABLE(organization_id uuid, role app_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE
  v_hash text := encode(extensions.digest(_token, 'sha256'), 'hex');
  v_inv public.organization_invitations%ROWTYPE;
  v_user record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT u.id, u.email, u.raw_user_meta_data INTO v_user FROM auth.users u WHERE u.id = auth.uid();

  SELECT * INTO v_inv FROM public.organization_invitations WHERE token_hash = v_hash FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'INVITE_CANCELLED'; END IF;
  IF v_inv.status = 'accepted' THEN RAISE EXCEPTION 'INVITE_ALREADY_ACCEPTED'; END IF;
  IF v_inv.expires_at < now() THEN
    UPDATE public.organization_invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'INVITE_EXPIRED';
  END IF;
  IF lower(v_user.email) <> lower(v_inv.email) THEN RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH'; END IF;

  INSERT INTO public.profiles AS p (id, full_name, email)
  VALUES (v_user.id, COALESCE(NULLIF(v_user.raw_user_meta_data->>'full_name',''), split_part(v_user.email,'@',1)), v_user.email)
  ON CONFLICT (id) DO UPDATE SET full_name = COALESCE(p.full_name, EXCLUDED.full_name),
                                 email = COALESCE(p.email, EXCLUDED.email);

  INSERT INTO public.organization_members AS m (organization_id, user_id, role, is_active)
  VALUES (v_inv.organization_id, v_user.id, v_inv.role, true)
  ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key
  DO UPDATE SET is_active = true, updated_at = now();

  UPDATE public.organization_invitations
     SET status = 'accepted', accepted_at = now(), token_hash = encode(extensions.gen_random_bytes(32),'hex')
   WHERE id = v_inv.id;

  INSERT INTO public.audit_logs (organization_id, actor_id, actor_name, action, entity, entity_id, metadata)
  VALUES (v_inv.organization_id, v_user.id, v_user.email, 'invite.accepted', 'member', v_user.id,
          jsonb_build_object('role', v_inv.role));

  RETURN QUERY SELECT v_inv.organization_id, v_inv.role;
END; $$;

CREATE OR REPLACE FUNCTION public.change_member_role(_member uuid, _role app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_m public.organization_members%ROWTYPE;
  v_is_owner boolean;
BEGIN
  SELECT * INTO v_m FROM public.organization_members WHERE id = _member FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF v_m.user_id = auth.uid() THEN RAISE EXCEPTION 'CANNOT_CHANGE_OWN_ROLE'; END IF;

  v_is_owner := public.has_org_role(v_m.organization_id, ARRAY['proprietario']::app_role[]);
  IF NOT v_is_owner AND NOT public.has_org_role(v_m.organization_id, ARRAY['administrador']::app_role[]) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF NOT v_is_owner AND (v_m.role = 'proprietario' OR _role IN ('proprietario','administrador')) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF v_m.role = 'proprietario' AND _role <> 'proprietario' THEN
    IF (SELECT count(*) FROM public.organization_members
         WHERE organization_id = v_m.organization_id AND role = 'proprietario' AND is_active) <= 1 THEN
      RAISE EXCEPTION 'LAST_OWNER';
    END IF;
  END IF;

  UPDATE public.organization_members SET role = _role, updated_at = now() WHERE id = _member;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (v_m.organization_id, auth.uid(), 'member.role_changed', 'member', v_m.user_id,
          jsonb_build_object('from', v_m.role, 'to', _role));
END; $$;

CREATE OR REPLACE FUNCTION public.set_member_active(_member uuid, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_m public.organization_members%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.organization_members WHERE id = _member FOR UPDATE;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF v_m.user_id = auth.uid() THEN RAISE EXCEPTION 'CANNOT_CHANGE_SELF'; END IF;
  IF NOT public.has_org_role(v_m.organization_id, ARRAY['proprietario','administrador']::app_role[]) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF v_m.role = 'proprietario' AND NOT public.has_org_role(v_m.organization_id, ARRAY['proprietario']::app_role[]) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF NOT _active AND v_m.role = 'proprietario' THEN
    IF (SELECT count(*) FROM public.organization_members
         WHERE organization_id = v_m.organization_id AND role = 'proprietario' AND is_active) <= 1 THEN
      RAISE EXCEPTION 'LAST_OWNER';
    END IF;
  END IF;

  UPDATE public.organization_members SET is_active = _active, updated_at = now() WHERE id = _member;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (v_m.organization_id, auth.uid(), CASE WHEN _active THEN 'member.reactivated' ELSE 'member.deactivated' END,
          'member', v_m.user_id, '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.transfer_member_responsibilities(_org uuid, _from uuid, _to uuid)
RETURNS TABLE(tasks_moved integer, processes_moved integer, monitoring_moved integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t int; p int; m int; v_name text;
BEGIN
  IF NOT public.has_org_role(_org, ARRAY['proprietario','administrador']::app_role[]) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_to AND is_active) THEN
    RAISE EXCEPTION 'TARGET_NOT_MEMBER';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = _to;

  WITH u AS (UPDATE public.tasks SET assignee_id=_to, assignee_name=v_name, updated_at=now()
             WHERE organization_id=_org AND assignee_id=_from AND status NOT IN ('concluida','cancelada','arquivada') RETURNING 1)
  SELECT count(*) INTO t FROM u;
  WITH u AS (UPDATE public.processes SET owner_id=_to, owner_name=v_name, updated_at=now()
             WHERE organization_id=_org AND owner_id=_from AND archived_at IS NULL RETURNING 1)
  SELECT count(*) INTO p FROM u;
  WITH u AS (UPDATE public.monitoring_items SET responsible_user_id=_to, responsible_name=v_name, updated_at=now()
             WHERE organization_id=_org AND responsible_user_id=_from AND archived_at IS NULL RETURNING 1)
  SELECT count(*) INTO m FROM u;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (_org, auth.uid(), 'member.responsibilities_transferred', 'member', _from,
          jsonb_build_object('to', _to, 'tasks', t, 'processes', p, 'monitoring', m));

  RETURN QUERY SELECT t, p, m;
END; $$;

REVOKE ALL ON FUNCTION public.create_invitation(uuid, text, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_member_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_member_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_member_responsibilities(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_member_responsibilities(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_preview(text) TO anon, authenticated;

-- ============ 7. INDEXES ============
CREATE INDEX IF NOT EXISTS tasks_organization_id_idx ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS tasks_process_id_idx ON public.tasks(process_id);
CREATE INDEX IF NOT EXISTS tasks_document_id_idx ON public.tasks(document_id);
CREATE INDEX IF NOT EXISTS tasks_monitoring_item_id_idx ON public.tasks(monitoring_item_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON public.tasks(due_at);
CREATE INDEX IF NOT EXISTS tasks_archived_at_idx ON public.tasks(archived_at);
CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS task_history_task_id_idx ON public.task_history(task_id);
CREATE INDEX IF NOT EXISTS organization_members_organization_id_idx ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS organization_members_role_idx ON public.organization_members(role);
CREATE INDEX IF NOT EXISTS organization_members_is_active_idx ON public.organization_members(is_active);
CREATE INDEX IF NOT EXISTS organization_invitations_org_idx ON public.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS organization_invitations_email_idx ON public.organization_invitations(lower(email));
CREATE INDEX IF NOT EXISTS organization_invitations_status_idx ON public.organization_invitations(status);
CREATE INDEX IF NOT EXISTS organization_invitations_expires_at_idx ON public.organization_invitations(expires_at);
