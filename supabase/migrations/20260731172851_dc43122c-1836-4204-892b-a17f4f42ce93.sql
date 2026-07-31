DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

DROP POLICY IF EXISTS "processes_insert" ON public.processes;
CREATE POLICY "processes_insert" ON public.processes FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

DROP POLICY IF EXISTS "processes_update" ON public.processes;
CREATE POLICY "processes_update" ON public.processes FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

DROP POLICY IF EXISTS "tasks_all" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::app_role[]));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::app_role[]));
