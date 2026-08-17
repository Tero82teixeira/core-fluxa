-- FLUXA — hardening de permissões por papel.
-- Mantém os cinco papéis atualmente atribuíveis pela Equipe e fecha divergências
-- entre UI, catálogo de permissões e RLS do banco.

-- ---------------------------------------------------------------------------
-- Catálogo de permissões: espelha a matriz ativa usada pelo produto.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission_key)
VALUES ('operacional'::public.app_role, 'reports.export')
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions
WHERE role IN ('operacional'::public.app_role, 'visualizador'::public.app_role)
  AND permission_key = 'finance.view';

DELETE FROM public.role_permissions
WHERE role = 'gestor'::public.app_role
  AND permission_key = 'team.manage';

-- ---------------------------------------------------------------------------
-- Financeiro: somente superadmin/proprietário/administrador/gestor leem dados.
-- Operacional e visualizador deixam de receber transações inclusive por vínculo.
-- Os papéis atendimento/financeiro/cliente_externo permanecem fora da matriz
-- atribuível atual e não recebem acesso por estas policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS financial_categories_read ON public.financial_categories;
CREATE POLICY financial_categories_read ON public.financial_categories
  FOR SELECT TO authenticated
  USING (public.has_org_role(
    organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]
  ));

DROP POLICY IF EXISTS financial_accounts_read ON public.financial_accounts;
CREATE POLICY financial_accounts_read ON public.financial_accounts
  FOR SELECT TO authenticated
  USING (public.has_org_role(
    organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]
  ));

DROP POLICY IF EXISTS financial_transactions_read ON public.financial_transactions;
CREATE POLICY financial_transactions_read ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (public.has_org_role(
    organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]
  ));

DROP POLICY IF EXISTS financial_payments_read ON public.financial_transaction_payments;
CREATE POLICY financial_payments_read ON public.financial_transaction_payments
  FOR SELECT TO authenticated
  USING (public.has_org_role(
    organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]
  ));

DROP POLICY IF EXISTS financial_recurrences_read ON public.financial_recurrences;
CREATE POLICY financial_recurrences_read ON public.financial_recurrences
  FOR SELECT TO authenticated
  USING (public.has_org_role(
    organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]
  ));

DROP POLICY IF EXISTS financial_movements_read ON public.financial_account_movements;
CREATE POLICY financial_movements_read ON public.financial_account_movements
  FOR SELECT TO authenticated
  USING (public.has_org_role(
    organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]
  ));

CREATE OR REPLACE FUNCTION public.financial_assert_editor(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT public.has_org_role(
    _org,
    ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.financial_assert_editor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_assert_editor(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Documentos: aprovação/rejeição/arquivamento e dados de revisão são campos
-- protegidos no banco, não apenas botões escondidos na interface.
-- Uma nova versão continua permitida ao operacional e sempre volta para análise.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.documents_guard_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_privileged boolean;
  v_version_editor boolean;
  v_version_submission boolean := false;
  v_actor_name text;
BEGIN
  -- Ações SQL administrativas e service_role são rotinas confiáveis; usuários
  -- da aplicação chegam a este trigger como role authenticated.
  IF current_user IN ('postgres','service_role','supabase_admin') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  v_privileged := public.has_org_role(
    NEW.organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  );
  v_version_editor := public.has_org_role(
    NEW.organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
  );
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    NEW.uploaded_by := auth.uid();
    NEW.uploaded_by_name := COALESCE(v_actor_name, NEW.uploaded_by_name);

    IF NOT v_privileged
       AND (NEW.status IN ('aprovado','rejeitado','arquivado') OR NEW.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED';
    END IF;

    IF v_privileged AND NEW.status IN ('aprovado','rejeitado','em_analise') THEN
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_by_name := v_actor_name;
      NEW.reviewed_at := now();
      IF NEW.status <> 'rejeitado' THEN
        NEW.rejection_reason := NULL;
      END IF;
    ELSE
      NEW.reviewed_by := NULL;
      NEW.reviewed_by_name := NULL;
      NEW.reviewed_at := NULL;
      NEW.rejection_reason := NULL;
    END IF;

    RETURN NEW;
  END IF;

  v_version_submission :=
    v_version_editor
    AND NEW.current_version = OLD.current_version + 1
    AND NEW.file_path IS DISTINCT FROM OLD.file_path
    AND NEW.status = 'em_analise'
    AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at;

  IF v_version_submission THEN
    NEW.uploaded_by := auth.uid();
    NEW.uploaded_by_name := v_actor_name;
    NEW.reviewed_by := NULL;
    NEW.reviewed_by_name := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;

  IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.uploaded_by_name IS DISTINCT FROM OLD.uploaded_by_name THEN
    RAISE EXCEPTION 'DOCUMENT_PROVENANCE_IMMUTABLE';
  END IF;

  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    IF NOT v_privileged THEN
      RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT v_privileged THEN
      RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED';
    END IF;

    IF NEW.status IN ('aprovado','rejeitado','em_analise') THEN
      NEW.reviewed_by := auth.uid();
      NEW.reviewed_by_name := v_actor_name;
      NEW.reviewed_at := now();
      IF NEW.status <> 'rejeitado' THEN
        NEW.rejection_reason := NULL;
      END IF;
    END IF;
  ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_by_name IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'DOCUMENT_REVIEW_PROVENANCE_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_guard_sensitive_fields_trg ON public.documents;
CREATE TRIGGER documents_guard_sensitive_fields_trg
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_sensitive_fields();

-- Versões também recebem escopo e autoria validados no banco. Isso impede uma
-- linha de versão apontar para documento pertencente a outra organização.
CREATE OR REPLACE FUNCTION public.document_versions_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT public.has_org_role(
    NEW.organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_VERSION_PERMISSION_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = NEW.document_id
      AND d.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'DOCUMENT_VERSION_ORG_MISMATCH';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();
  NEW.uploaded_by := auth.uid();
  NEW.uploaded_by_name := v_actor_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_versions_guard_insert_trg ON public.document_versions;
CREATE TRIGGER document_versions_guard_insert_trg
  BEFORE INSERT ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.document_versions_guard_insert();

DROP POLICY IF EXISTS document_versions_insert_editor ON public.document_versions;
CREATE POLICY document_versions_insert_editor ON public.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(
    organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
  ));
