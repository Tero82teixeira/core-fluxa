-- Billing details are visible only to the roles that can manage the FLUXA
-- subscription. Payment state remains service-controlled by the Kiwify webhook.

DROP POLICY IF EXISTS organization_subscriptions_read
  ON public.organization_subscriptions;
CREATE POLICY organization_subscriptions_read
  ON public.organization_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    public.has_org_role(
      organization_id,
      ARRAY['superadmin', 'proprietario', 'administrador']::public.app_role[]
    )
    OR public.is_platform_admin()
  );
