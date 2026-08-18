-- Configuration remains readable by active members, but only organization
-- administrators may change it.
DROP POLICY IF EXISTS "process_stages_all" ON public.process_stages;
DROP POLICY IF EXISTS "process_stages_select" ON public.process_stages;
DROP POLICY IF EXISTS "process_stages_insert" ON public.process_stages;
DROP POLICY IF EXISTS "process_stages_update" ON public.process_stages;
DROP POLICY IF EXISTS "process_stages_delete" ON public.process_stages;

CREATE POLICY "process_stages_select"
ON public.process_stages
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY "process_stages_insert"
ON public.process_stages
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
);

CREATE POLICY "process_stages_update"
ON public.process_stages
FOR UPDATE
TO authenticated
USING (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
)
WITH CHECK (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
);

CREATE POLICY "process_stages_delete"
ON public.process_stages
FOR DELETE
TO authenticated
USING (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
);

DROP POLICY IF EXISTS "service_types_all" ON public.service_types;
DROP POLICY IF EXISTS "service_types_select" ON public.service_types;
DROP POLICY IF EXISTS "service_types_insert" ON public.service_types;
DROP POLICY IF EXISTS "service_types_update" ON public.service_types;
DROP POLICY IF EXISTS "service_types_delete" ON public.service_types;

CREATE POLICY "service_types_select"
ON public.service_types
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY "service_types_insert"
ON public.service_types
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
);

CREATE POLICY "service_types_update"
ON public.service_types
FOR UPDATE
TO authenticated
USING (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
)
WITH CHECK (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
);

CREATE POLICY "service_types_delete"
ON public.service_types
FOR DELETE
TO authenticated
USING (
  public.has_org_role(
    organization_id,
    ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
  )
);

-- Task history is server-maintained and exposed to clients as read-only.
DROP POLICY IF EXISTS "task_history_insert" ON public.task_history;
DROP POLICY IF EXISTS "task_history_select" ON public.task_history;

CREATE POLICY "task_history_select"
ON public.task_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tasks AS task
    WHERE task.id = task_history.task_id
      AND task.organization_id = task_history.organization_id
      AND public.is_org_member(task.organization_id)
  )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.task_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.task_history FROM anon;
