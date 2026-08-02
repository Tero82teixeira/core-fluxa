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
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]));

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.task_comments TO authenticated;
GRANT SELECT, INSERT ON public.task_history TO authenticated;
