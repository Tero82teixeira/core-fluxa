-- Contatos: separar leitura sensível por papel (antes: qualquer membro ativo)
DROP POLICY IF EXISTS client_contacts_all ON public.client_contacts;

CREATE POLICY client_contacts_select ON public.client_contacts
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]));

CREATE POLICY client_contacts_insert ON public.client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]));

CREATE POLICY client_contacts_update ON public.client_contacts
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]));

CREATE POLICY client_contacts_delete ON public.client_contacts
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor']::public.app_role[]));

-- Endereços: mesma regra (endereço é dado sensível do cliente)
DROP POLICY IF EXISTS client_addresses_all ON public.client_addresses;

CREATE POLICY client_addresses_select ON public.client_addresses
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]));

CREATE POLICY client_addresses_insert ON public.client_addresses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]));

CREATE POLICY client_addresses_update ON public.client_addresses
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]));

CREATE POLICY client_addresses_delete ON public.client_addresses
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor']::public.app_role[]));