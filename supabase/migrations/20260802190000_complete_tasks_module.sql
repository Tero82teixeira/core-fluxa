-- Conclusão aditiva do módulo de tarefas. Nenhuma linha existente é removida.
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'aguardando';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'arquivada';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS due_time time,
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monitoring_item_id uuid REFERENCES public.monitoring_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD CONSTRAINT tasks_recurrence_type_check
    CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Validação centralizada: nenhum vínculo pode atravessar a fronteira da organização.
CREATE OR REPLACE FUNCTION public.tasks_enforce_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_process public.processes%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'TASK_ORGANIZATION_IMMUTABLE';
  END IF;
  IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.assignee_id AND m.is_active
  ) THEN RAISE EXCEPTION 'TASK_ASSIGNEE_NOT_MEMBER'; END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'TASK_CLIENT_ORG_MISMATCH'; END IF;
  IF NEW.process_id IS NOT NULL THEN
    SELECT * INTO v_process FROM public.processes p
      WHERE p.id = NEW.process_id AND p.organization_id = NEW.organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TASK_PROCESS_ORG_MISMATCH'; END IF;
    IF NEW.client_id IS NULL THEN NEW.client_id := v_process.client_id;
    ELSIF NEW.client_id IS DISTINCT FROM v_process.client_id THEN
      RAISE EXCEPTION 'TASK_CLIENT_PROCESS_MISMATCH';
    END IF;
  END IF;
  IF NEW.document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents d WHERE d.id = NEW.document_id AND d.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'TASK_DOCUMENT_ORG_MISMATCH'; END IF;
  IF NEW.monitoring_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.monitoring_items m WHERE m.id = NEW.monitoring_item_id AND m.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'TASK_MONITORING_ORG_MISMATCH'; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tasks_enforce_links_trg ON public.tasks;
CREATE TRIGGER tasks_enforce_links_trg BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_enforce_links();

CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE, user_id uuid, user_name text,
  comment text NOT NULL CHECK (length(btrim(comment)) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE, user_id uuid, user_name text,
  action text NOT NULL, old_value text, new_value text, created_at timestamptz NOT NULL DEFAULT now()
);

-- Comentários e histórico sempre permanecem junto da tarefa e organização originais.
CREATE OR REPLACE FUNCTION public.task_children_enforce_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'TASK_CHILD_ORGANIZATION_IMMUTABLE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = NEW.task_id AND t.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'TASK_CHILD_ORG_MISMATCH'; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS task_comments_enforce_scope_trg ON public.task_comments;
CREATE TRIGGER task_comments_enforce_scope_trg BEFORE INSERT OR UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_children_enforce_scope();
DROP TRIGGER IF EXISTS task_history_enforce_scope_trg ON public.task_history;
CREATE TRIGGER task_history_enforce_scope_trg BEFORE INSERT OR UPDATE ON public.task_history
  FOR EACH ROW EXECUTE FUNCTION public.task_children_enforce_scope();

CREATE INDEX IF NOT EXISTS tasks_org_due_active_idx ON public.tasks (organization_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_org_status_idx ON public.tasks (organization_id, status);
CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON public.tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_document_id_idx ON public.tasks (document_id);
CREATE INDEX IF NOT EXISTS tasks_monitoring_item_id_idx ON public.tasks (monitoring_item_id);
CREATE INDEX IF NOT EXISTS task_comments_task_id_idx ON public.task_comments (task_id, created_at);
CREATE INDEX IF NOT EXISTS task_history_task_id_idx ON public.task_history (task_id, created_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[])
  AND (created_by IS NULL OR created_by = auth.uid())
);
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[]));

DROP POLICY IF EXISTS task_comments_select ON public.task_comments;
DROP POLICY IF EXISTS task_comments_insert ON public.task_comments;
DROP POLICY IF EXISTS task_comments_update_own ON public.task_comments;
CREATE POLICY task_comments_select ON public.task_comments FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY task_comments_insert ON public.task_comments FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[])
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.organization_id = organization_id)
);
CREATE POLICY task_comments_update_own ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS task_history_select ON public.task_history;
DROP POLICY IF EXISTS task_history_insert ON public.task_history;
CREATE POLICY task_history_select ON public.task_history FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY task_history_insert ON public.task_history FOR INSERT TO authenticated WITH CHECK (
  public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[])
  AND (user_id IS NULL OR user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.organization_id = organization_id)
);

REVOKE DELETE ON public.tasks FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.task_comments TO authenticated;
GRANT SELECT, INSERT ON public.task_history TO authenticated;
