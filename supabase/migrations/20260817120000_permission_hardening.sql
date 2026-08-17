-- Authorization hardening: the database, rather than UI visibility, is authoritative.
CREATE OR REPLACE FUNCTION public.documents_authorization_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text;
  v_uploader boolean;
  v_reviewer boolean;
  v_new_version boolean := false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'DOCUMENT_AUTH_REQUIRED'; END IF;
  v_uploader := public.has_org_role(NEW.organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]);
  v_reviewer := public.has_org_role(NEW.organization_id, ARRAY['superadmin','proprietario','administrador']::public.app_role[]);
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_actor;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_uploader THEN RAISE EXCEPTION 'DOCUMENT_UPLOAD_DENIED'; END IF;
    NEW.uploaded_by := v_actor;
    NEW.uploaded_by_name := COALESCE(v_name, NEW.uploaded_by_name);
    IF NOT v_reviewer AND (NEW.status IN ('aprovado','rejeitado','arquivado') OR NEW.archived_at IS NOT NULL
      OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_by_name IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.rejection_reason IS NOT NULL)
    THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
    IF v_reviewer AND NEW.status IN ('aprovado','rejeitado','em_analise') THEN
      NEW.reviewed_by := v_actor;
      NEW.reviewed_by_name := v_name;
      NEW.reviewed_at := now();
      IF NEW.status <> 'rejeitado' THEN NEW.rejection_reason := NULL; END IF;
    ELSE
      NEW.reviewed_by := NULL;
      NEW.reviewed_by_name := NULL;
      NEW.reviewed_at := NULL;
      NEW.rejection_reason := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'DOCUMENT_ORGANIZATION_IMMUTABLE'; END IF;
  v_new_version := v_uploader
    AND NEW.current_version = OLD.current_version + 1
    AND NEW.file_path IS DISTINCT FROM OLD.file_path;

  IF v_new_version THEN
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
    IF (to_jsonb(NEW) - ARRAY['file_path','original_file_name','stored_file_name','file_extension','mime_type','file_size','current_version','status','uploaded_by','uploaded_by_name','reviewed_by','reviewed_by_name','reviewed_at','rejection_reason','updated_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['file_path','original_file_name','stored_file_name','file_extension','mime_type','file_size','current_version','status','uploaded_by','uploaded_by_name','reviewed_by','reviewed_by_name','reviewed_at','rejection_reason','updated_at'])
    THEN RAISE EXCEPTION 'DOCUMENT_VERSION_FIELDS_DENIED'; END IF;
    NEW.status := 'em_analise';
    NEW.archived_at := OLD.archived_at;
    NEW.uploaded_by := v_actor;
    NEW.uploaded_by_name := COALESCE(v_name, OLD.uploaded_by_name);
    NEW.reviewed_by := NULL; NEW.reviewed_by_name := NULL; NEW.reviewed_at := NULL; NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;

  IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR NEW.uploaded_by_name IS DISTINCT FROM OLD.uploaded_by_name
  THEN RAISE EXCEPTION 'DOCUMENT_PROVENANCE_IMMUTABLE'; END IF;
  IF NEW.archived_at IS DISTINCT FROM OLD.archived_at AND NOT v_reviewer
  THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT v_reviewer THEN RAISE EXCEPTION 'DOCUMENT_SENSITIVE_UPDATE_DENIED'; END IF;
    NEW.reviewed_by := v_actor;
    NEW.reviewed_by_name := COALESCE(v_name, NEW.reviewed_by_name);
    NEW.reviewed_at := now();
    IF NEW.status <> 'rejeitado' THEN NEW.rejection_reason := NULL; END IF;
  ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_by_name IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  THEN RAISE EXCEPTION 'DOCUMENT_REVIEW_PROVENANCE_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS documents_authorization_guard_trg ON public.documents;
CREATE TRIGGER documents_authorization_guard_trg BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.documents_authorization_guard();

CREATE OR REPLACE FUNCTION public.document_versions_authorization_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_name text; v_document_org uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'DOCUMENT_AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(NEW.organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[])
  THEN RAISE EXCEPTION 'DOCUMENT_VERSION_UPLOAD_DENIED'; END IF;
  SELECT organization_id INTO v_document_org FROM public.documents WHERE id = NEW.document_id;
  IF v_document_org IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND'; END IF;
  IF v_document_org <> NEW.organization_id THEN RAISE EXCEPTION 'DOCUMENT_VERSION_ORG_MISMATCH'; END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_actor;
  NEW.uploaded_by := v_actor;
  NEW.uploaded_by_name := COALESCE(v_name, NEW.uploaded_by_name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS document_versions_authorization_guard_trg ON public.document_versions;
CREATE TRIGGER document_versions_authorization_guard_trg BEFORE INSERT ON public.document_versions
FOR EACH ROW EXECUTE FUNCTION public.document_versions_authorization_guard();

DROP POLICY IF EXISTS documents_insert_editor ON public.documents;
CREATE POLICY documents_insert_editor ON public.documents FOR INSERT TO authenticated WITH CHECK
  (public.has_org_role(organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
DROP POLICY IF EXISTS documents_update_editor ON public.documents;
CREATE POLICY documents_update_editor ON public.documents FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
DROP POLICY IF EXISTS document_versions_insert_editor ON public.document_versions;
CREATE POLICY document_versions_insert_editor ON public.document_versions FOR INSERT TO authenticated WITH CHECK
  (public.has_org_role(organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));

DO $$ DECLARE t text; p text; BEGIN
  FOR t,p IN SELECT * FROM (VALUES
    ('financial_categories','financial_categories_read'),('financial_accounts','financial_accounts_read'),
    ('financial_transactions','financial_transactions_read'),('financial_transaction_payments','financial_payments_read'),
    ('financial_recurrences','financial_recurrences_read'),('financial_account_movements','financial_movements_read')) x(t,p)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',p,t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_org_role(organization_id, ARRAY[''superadmin'',''proprietario'',''administrador'',''gestor'']::public.app_role[]))',p,t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.financial_assert_editor(_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_org,ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
END $$;

-- Rebuild only the five active roles (plus internal superadmin); legacy roles stay reserved.
DELETE FROM public.role_permissions WHERE role IN
 ('superadmin','proprietario','administrador','gestor','operacional','visualizador','atendimento','financeiro','cliente_externo');
INSERT INTO public.role_permissions(role,permission_key)
SELECT r::public.app_role,p.key FROM unnest(ARRAY['superadmin','proprietario','administrador']) r CROSS JOIN public.permissions p;
INSERT INTO public.role_permissions(role,permission_key)
SELECT 'gestor',key FROM public.permissions WHERE key NOT IN ('settings.manage','team.manage');
INSERT INTO public.role_permissions(role,permission_key)
SELECT 'operacional',key FROM public.permissions WHERE key IN
 ('clients.view','clients.create','clients.edit','processes.view','processes.create','processes.edit','reports.export');
INSERT INTO public.role_permissions(role,permission_key)
SELECT 'visualizador',key FROM public.permissions WHERE key IN ('clients.view','processes.view');

REVOKE ALL ON FUNCTION public.documents_authorization_guard(), public.document_versions_authorization_guard() FROM PUBLIC, anon, authenticated;
