-- ============================================================
-- FLUXA — Documentos e Monitoramento
-- ============================================================

CREATE TYPE public.document_status AS ENUM (
  'pendente','recebido','em_analise','aprovado','rejeitado','vencido','arquivado'
);

CREATE TYPE public.document_category AS ENUM (
  'identificacao','certidao','comprovante','contrato','formulario','autorizacao','registro','licenca','financeiro','outros'
);

CREATE TYPE public.monitoring_status AS ENUM (
  'ativo','em_renovacao','renovado','arquivado'
);

-- ------------------------------------------------------------
-- document_types
-- ------------------------------------------------------------
CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category public.document_category NOT NULL DEFAULT 'outros',
  default_validity_days integer,
  requires_expiration_date boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz
);

CREATE UNIQUE INDEX document_types_org_name_unique ON public.document_types (organization_id, lower(name));
CREATE INDEX document_types_organization_id_idx ON public.document_types (organization_id);

GRANT SELECT, INSERT, UPDATE ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_types_select_member" ON public.document_types
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "document_types_insert_admin" ON public.document_types
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::app_role[]));
CREATE POLICY "document_types_update_admin" ON public.document_types
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::app_role[]));

CREATE TRIGGER document_types_set_updated_at
  BEFORE UPDATE ON public.document_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- documents
-- ------------------------------------------------------------
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  checklist_item_id uuid REFERENCES public.process_checklist_items(id) ON DELETE SET NULL,
  document_type_id uuid REFERENCES public.document_types(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  document_number text,
  issuer text,
  issue_date date,
  expiration_date date,
  status public.document_status NOT NULL DEFAULT 'recebido',
  file_path text NOT NULL,
  original_file_name text NOT NULL,
  stored_file_name text NOT NULL,
  file_extension text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  uploaded_by uuid,
  uploaded_by_name text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX documents_organization_id_idx ON public.documents (organization_id);
CREATE INDEX documents_client_id_idx ON public.documents (client_id);
CREATE INDEX documents_process_id_idx ON public.documents (process_id);
CREATE INDEX documents_document_type_id_idx ON public.documents (document_type_id);
CREATE INDEX documents_checklist_item_id_idx ON public.documents (checklist_item_id);
CREATE INDEX documents_status_idx ON public.documents (status);
CREATE INDEX documents_expiration_date_idx ON public.documents (expiration_date);
CREATE INDEX documents_archived_at_idx ON public.documents (archived_at);

GRANT SELECT, INSERT, UPDATE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_member" ON public.documents
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "documents_insert_editor" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));
CREATE POLICY "documents_update_editor" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Coerência de vínculos: processo/cliente precisam ser da mesma organização.
CREATE OR REPLACE FUNCTION public.documents_enforce_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_process public.processes%ROWTYPE;
  v_client_org uuid;
BEGIN
  IF NEW.process_id IS NOT NULL THEN
    SELECT * INTO v_process FROM public.processes WHERE id = NEW.process_id;
    IF NOT FOUND OR v_process.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'DOCUMENT_PROCESS_ORG_MISMATCH';
    END IF;
    IF NEW.client_id IS NULL THEN
      NEW.client_id := v_process.client_id;
    ELSIF NEW.client_id <> v_process.client_id THEN
      RAISE EXCEPTION 'DOCUMENT_CLIENT_PROCESS_MISMATCH';
    END IF;
  END IF;

  IF NEW.client_id IS NOT NULL THEN
    SELECT organization_id INTO v_client_org FROM public.clients WHERE id = NEW.client_id;
    IF v_client_org IS NULL OR v_client_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'DOCUMENT_CLIENT_ORG_MISMATCH';
    END IF;
  END IF;

  IF NEW.checklist_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.process_checklist_items c
      WHERE c.id = NEW.checklist_item_id
        AND c.organization_id = NEW.organization_id
        AND (NEW.process_id IS NULL OR c.process_id = NEW.process_id)
    ) THEN
      RAISE EXCEPTION 'DOCUMENT_CHECKLIST_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_enforce_links_trg
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_enforce_links();

-- ------------------------------------------------------------
-- document_versions
-- ------------------------------------------------------------
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_path text NOT NULL,
  original_file_name text NOT NULL,
  stored_file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  uploaded_by uuid,
  uploaded_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX document_versions_document_version_unique
  ON public.document_versions (document_id, version_number);
CREATE INDEX document_versions_document_id_idx ON public.document_versions (document_id);
CREATE INDEX document_versions_organization_id_idx ON public.document_versions (organization_id);

GRANT SELECT, INSERT ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_versions_select_member" ON public.document_versions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "document_versions_insert_editor" ON public.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

-- ------------------------------------------------------------
-- monitoring_items
-- ------------------------------------------------------------
CREATE TABLE public.monitoring_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  title text NOT NULL,
  type public.document_category NOT NULL DEFAULT 'outros',
  reference_number text,
  issue_date date,
  expiration_date date,
  responsible_user_id uuid,
  responsible_name text,
  status public.monitoring_status NOT NULL DEFAULT 'ativo',
  auto_generated boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  archived_at timestamptz
);

CREATE INDEX monitoring_items_organization_id_idx ON public.monitoring_items (organization_id);
CREATE INDEX monitoring_items_client_id_idx ON public.monitoring_items (client_id);
CREATE INDEX monitoring_items_process_id_idx ON public.monitoring_items (process_id);
CREATE INDEX monitoring_items_document_id_idx ON public.monitoring_items (document_id);
CREATE INDEX monitoring_items_expiration_date_idx ON public.monitoring_items (expiration_date);
CREATE INDEX monitoring_items_status_idx ON public.monitoring_items (status);
CREATE INDEX monitoring_items_archived_at_idx ON public.monitoring_items (archived_at);

-- No máximo um item automático ativo por documento.
CREATE UNIQUE INDEX monitoring_items_auto_document_unique
  ON public.monitoring_items (document_id)
  WHERE auto_generated AND archived_at IS NULL AND document_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.monitoring_items TO authenticated;
GRANT ALL ON public.monitoring_items TO service_role;
ALTER TABLE public.monitoring_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitoring_items_select_member" ON public.monitoring_items
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "monitoring_items_insert_editor" ON public.monitoring_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));
CREATE POLICY "monitoring_items_update_editor" ON public.monitoring_items
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

CREATE TRIGGER monitoring_items_set_updated_at
  BEFORE UPDATE ON public.monitoring_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- monitoring_history
-- ------------------------------------------------------------
CREATE TABLE public.monitoring_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  monitoring_item_id uuid NOT NULL REFERENCES public.monitoring_items(id) ON DELETE CASCADE,
  previous_issue_date date,
  new_issue_date date,
  previous_expiration_date date,
  new_expiration_date date,
  previous_document_id uuid,
  new_document_id uuid,
  changed_by uuid,
  changed_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX monitoring_history_monitoring_item_id_idx ON public.monitoring_history (monitoring_item_id);
CREATE INDEX monitoring_history_organization_id_idx ON public.monitoring_history (organization_id);

GRANT SELECT, INSERT ON public.monitoring_history TO authenticated;
GRANT ALL ON public.monitoring_history TO service_role;
ALTER TABLE public.monitoring_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monitoring_history_select_member" ON public.monitoring_history
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "monitoring_history_insert_editor" ON public.monitoring_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

-- ------------------------------------------------------------
-- View de situação (sempre calculada com current_date do banco)
-- ------------------------------------------------------------
CREATE VIEW public.monitoring_items_status_view
WITH (security_invoker = on) AS
SELECT
  m.*,
  (m.expiration_date - current_date) AS days_remaining,
  CASE
    WHEN m.archived_at IS NOT NULL THEN 'arquivado'
    WHEN m.expiration_date IS NULL THEN 'sem_validade'
    WHEN m.expiration_date < current_date THEN 'vencido'
    WHEN m.expiration_date = current_date THEN 'vence_hoje'
    WHEN m.expiration_date <= current_date + 7 THEN 'ate_7'
    WHEN m.expiration_date <= current_date + 15 THEN 'ate_15'
    WHEN m.expiration_date <= current_date + 30 THEN 'ate_30'
    WHEN m.expiration_date <= current_date + 60 THEN 'ate_60'
    ELSE 'regular'
  END AS situation,
  CASE
    WHEN m.archived_at IS NOT NULL THEN 0
    WHEN m.expiration_date IS NULL THEN 1
    WHEN m.expiration_date < current_date THEN 5
    WHEN m.expiration_date <= current_date + 7 THEN 4
    WHEN m.expiration_date <= current_date + 30 THEN 3
    WHEN m.expiration_date <= current_date + 60 THEN 2
    ELSE 1
  END AS urgency,
  (m.archived_at IS NULL AND m.expiration_date IS NOT NULL AND m.expiration_date < current_date) AS is_expired,
  (m.archived_at IS NULL AND m.expiration_date IS NOT NULL
    AND m.expiration_date >= current_date AND m.expiration_date <= current_date + 30) AS is_expiring_soon
FROM public.monitoring_items m;

GRANT SELECT ON public.monitoring_items_status_view TO authenticated;
GRANT SELECT ON public.monitoring_items_status_view TO service_role;

-- ------------------------------------------------------------
-- Monitoramento automático a partir de documentos com validade
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.documents_sync_monitoring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category public.document_category := 'outros';
BEGIN
  IF NEW.expiration_date IS NULL OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.category INTO v_category FROM public.document_types t WHERE t.id = NEW.document_type_id;

  INSERT INTO public.monitoring_items (
    organization_id, client_id, process_id, document_id, title, type,
    reference_number, issue_date, expiration_date, status, auto_generated, created_by
  )
  VALUES (
    NEW.organization_id, NEW.client_id, NEW.process_id, NEW.id, NEW.title,
    COALESCE(v_category, 'outros'), NEW.document_number, NEW.issue_date, NEW.expiration_date,
    'ativo', true, NEW.uploaded_by
  )
  ON CONFLICT (document_id) WHERE (auto_generated AND archived_at IS NULL AND document_id IS NOT NULL)
  DO UPDATE SET
    expiration_date = EXCLUDED.expiration_date,
    issue_date = EXCLUDED.issue_date,
    title = EXCLUDED.title,
    client_id = EXCLUDED.client_id,
    process_id = EXCLUDED.process_id,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_sync_monitoring_trg
  AFTER INSERT OR UPDATE OF expiration_date, issue_date, title, archived_at ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_sync_monitoring();

-- ------------------------------------------------------------
-- Tipos de documento padrão por organização
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_document_types(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.document_types (organization_id, name, category, requires_expiration_date, default_validity_days)
  VALUES
    (_org, 'Documento de identificação', 'identificacao', false, NULL),
    (_org, 'CPF', 'identificacao', false, NULL),
    (_org, 'CNPJ', 'identificacao', false, NULL),
    (_org, 'Comprovante de residência', 'comprovante', false, 90),
    (_org, 'Certidão', 'certidao', true, 90),
    (_org, 'Contrato', 'contrato', false, NULL),
    (_org, 'Formulário assinado', 'formulario', false, NULL),
    (_org, 'Comprovante de pagamento', 'financeiro', false, NULL),
    (_org, 'Autorização', 'autorizacao', true, 365),
    (_org, 'Licença', 'licenca', true, 365),
    (_org, 'Registro', 'registro', true, 365),
    (_org, 'Outros', 'outros', false, NULL)
  ON CONFLICT (organization_id, lower(name)) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_document_types(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_document_types(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.organizations_seed_document_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_document_types(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_seed_document_types_trg
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_seed_document_types();

-- Popula as organizações já existentes.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_document_types(r.id);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Notificações internas sem duplicidade
-- ------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_org_dedupe_unique
  ON public.notifications (organization_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ------------------------------------------------------------
-- Storage: acesso restrito por organização (primeiro segmento do caminho)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_path_org(_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE v_first text;
BEGIN
  v_first := split_part(_name, '/', 1);
  IF v_first !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_first::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.storage_path_org(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_path_org(text) TO authenticated, service_role;

CREATE POLICY "org_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'organization-documents'
    AND public.storage_path_org(name) IS NOT NULL
    AND public.is_org_member(public.storage_path_org(name))
  );

CREATE POLICY "org_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'organization-documents'
    AND public.storage_path_org(name) IS NOT NULL
    AND public.has_org_role(
      public.storage_path_org(name),
      ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]
    )
  );

CREATE POLICY "org_documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'organization-documents'
    AND public.storage_path_org(name) IS NOT NULL
    AND public.has_org_role(
      public.storage_path_org(name),
      ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]
    )
  )
  WITH CHECK (
    bucket_id = 'organization-documents'
    AND public.storage_path_org(name) IS NOT NULL
    AND public.has_org_role(
      public.storage_path_org(name),
      ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]
    )
  );

CREATE POLICY "org_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'organization-documents'
    AND public.storage_path_org(name) IS NOT NULL
    AND public.has_org_role(
      public.storage_path_org(name),
      ARRAY['proprietario','administrador']::app_role[]
    )
  );