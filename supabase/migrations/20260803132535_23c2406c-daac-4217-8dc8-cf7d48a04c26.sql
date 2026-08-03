-- 1. Visão segura de clientes: mascara PII por papel e limita o escopo do Operacional.
CREATE OR REPLACE VIEW public.clients_secure AS
SELECT
  c.id,
  c.organization_id,
  c.person_type,
  c.name,
  c.trade_name,
  c.status,
  c.city,
  c.state,
  c.owner_id,
  c.owner_name,
  c.last_interaction_at,
  c.archived_at,
  c.created_at,
  c.updated_at,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.document END AS document,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.document_digits END AS document_digits,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.birth_date END AS birth_date,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.legal_rep_name END AS legal_rep_name,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.email END AS email,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.phone END AS phone,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.whatsapp END AS whatsapp,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.zip_code END AS zip_code,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.street END AS street,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.number END AS number,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.complement END AS complement,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.district END AS district,
  CASE WHEN public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]) THEN c.notes END AS notes
FROM public.clients c
WHERE public.is_org_member(c.organization_id)
  AND (
    public.has_org_role(c.organization_id, ARRAY['proprietario','administrador','gestor','atendimento','financeiro','visualizador']::public.app_role[])
    OR (
      public.has_org_role(c.organization_id, ARRAY['operacional']::public.app_role[])
      AND (
        c.owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.processes p WHERE p.client_id = c.id AND p.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.client_id = c.id AND t.assignee_id = auth.uid())
      )
    )
  );

REVOKE ALL ON public.clients_secure FROM PUBLIC, anon;
GRANT SELECT ON public.clients_secure TO authenticated;
GRANT ALL ON public.clients_secure TO service_role;

-- 2. Tabela base: leitura direta perde as colunas sensíveis (PII só pela visão segura).
REVOKE SELECT ON public.clients FROM authenticated;
GRANT SELECT (
  id, organization_id, person_type, name, trade_name, status, city, state,
  owner_id, owner_name, last_interaction_at, archived_at,
  created_at, updated_at, created_by, updated_by
) ON public.clients TO authenticated;