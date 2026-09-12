BEGIN;

DROP POLICY IF EXISTS audit_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_select_management ON public.audit_logs;

CREATE POLICY audit_select_management
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.has_org_role(
    organization_id,
    ARRAY['proprietario', 'administrador']::public.app_role[]
  )
  OR public.is_platform_admin()
);

COMMENT ON POLICY audit_select_management ON public.audit_logs IS
  'Restricts the complete organization audit trail to tenant management and platform administrators.';

COMMIT;
