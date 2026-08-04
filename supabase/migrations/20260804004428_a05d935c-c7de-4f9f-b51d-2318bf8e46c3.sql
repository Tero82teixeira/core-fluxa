-- Função interna: entrega os campos sensíveis apenas para papéis autorizados.
CREATE OR REPLACE FUNCTION public.client_sensitive(_client uuid)
RETURNS TABLE(
  document text, document_digits text, birth_date date, legal_rep_name text,
  email text, phone text, whatsapp text, zip_code text, street text,
  number text, complement text, district text, notes text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.document, c.document_digits, c.birth_date, c.legal_rep_name,
         c.email, c.phone, c.whatsapp, c.zip_code, c.street,
         c.number, c.complement, c.district, c.notes
  FROM public.clients c
  WHERE c.id = _client
    AND public.has_org_role(
      c.organization_id,
      ARRAY['proprietario','administrador','gestor','operacional','atendimento','financeiro']::public.app_role[]
    );
$$;
REVOKE ALL ON FUNCTION public.client_sensitive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_sensitive(uuid) TO authenticated;

-- Visão agora SECURITY INVOKER (PostgreSQL 17): RLS da tabela base é aplicada ao usuário.
CREATE OR REPLACE VIEW public.clients_secure WITH (security_invoker = true) AS
SELECT
  c.id, c.organization_id, c.person_type, c.name, c.trade_name, c.status,
  c.city, c.state, c.owner_id, c.owner_name, c.last_interaction_at,
  c.archived_at, c.created_at, c.updated_at,
  s.document, s.document_digits, s.birth_date, s.legal_rep_name,
  s.email, s.phone, s.whatsapp, s.zip_code, s.street, s.number,
  s.complement, s.district, s.notes
FROM public.clients c
LEFT JOIN LATERAL public.client_sensitive(c.id) s ON true
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