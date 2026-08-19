-- Security audit stage 13: least-privilege grants and canonical document RLS.
-- Uploads, versioning and reviews are direct PostgREST DML in the web client,
-- so authenticated keeps only the table privileges those flows require.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.documents, public.document_versions, public.document_types
  FROM anon;
REVOKE SELECT ON TABLE public.documents, public.document_versions, public.document_types FROM anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.documents, public.document_versions, public.document_types
  FROM authenticated;
REVOKE DELETE ON TABLE public.documents, public.document_versions, public.document_types FROM authenticated;
REVOKE UPDATE ON TABLE public.document_versions FROM authenticated;

-- State the client contract explicitly instead of depending on historical grants.
GRANT SELECT, INSERT, UPDATE ON TABLE public.documents TO authenticated;
GRANT SELECT, INSERT ON TABLE public.document_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.document_types TO authenticated;

-- Recreate the effective policies so environments that still carry the legacy
-- atendimento expressions converge on the five current document editor roles.
DROP POLICY IF EXISTS documents_select_member ON public.documents;
DROP POLICY IF EXISTS documents_insert_editor ON public.documents;
DROP POLICY IF EXISTS documents_update_editor ON public.documents;
CREATE POLICY documents_select_member ON public.documents
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY documents_insert_editor ON public.documents
  FOR INSERT TO authenticated WITH CHECK (
    public.has_org_role(organization_id, ARRAY['superadmin', 'proprietario', 'administrador', 'gestor', 'operacional']::public.app_role[])
  );
CREATE POLICY documents_update_editor ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['superadmin', 'proprietario', 'administrador', 'gestor', 'operacional']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['superadmin', 'proprietario', 'administrador', 'gestor', 'operacional']::public.app_role[]));

DROP POLICY IF EXISTS document_versions_select_member ON public.document_versions;
DROP POLICY IF EXISTS document_versions_insert_editor ON public.document_versions;
CREATE POLICY document_versions_select_member ON public.document_versions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY document_versions_insert_editor ON public.document_versions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_org_role(organization_id, ARRAY['superadmin', 'proprietario', 'administrador', 'gestor', 'operacional']::public.app_role[])
  );

-- Document type administration remains owner/admin-only; archival is UPDATE.
DROP POLICY IF EXISTS document_types_select_member ON public.document_types;
DROP POLICY IF EXISTS document_types_insert_admin ON public.document_types;
DROP POLICY IF EXISTS document_types_update_admin ON public.document_types;
CREATE POLICY document_types_select_member ON public.document_types
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY document_types_insert_admin ON public.document_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_org_role(organization_id, ARRAY['proprietario', 'administrador']::public.app_role[])
  );
CREATE POLICY document_types_update_admin ON public.document_types
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario', 'administrador']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario', 'administrador']::public.app_role[]));

-- These are trigger-only guards. Reassert their API lockdown without replacing them.
REVOKE ALL ON FUNCTION public.documents_authorization_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.document_versions_authorization_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.documents_enforce_links() FROM PUBLIC, anon, authenticated;
