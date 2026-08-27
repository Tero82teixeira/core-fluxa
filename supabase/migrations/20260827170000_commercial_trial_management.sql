-- Commercial foundation: controlled trials for new organizations and a
-- platform-only administration surface. Existing organizations remain active.

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_subscriptions (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  plan_code text NOT NULL DEFAULT 'trial',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CHECK (
    status <> 'trial'
    OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL)
  ),
  CHECK (trial_ends_at IS NULL OR trial_started_at IS NULL OR trial_ends_at > trial_started_at)
);

CREATE INDEX organization_subscriptions_status_idx
  ON public.organization_subscriptions(status, trial_ends_at);

-- Everything that predates commercial control is a legacy active workspace.
INSERT INTO public.organization_subscriptions(
  organization_id,
  status,
  plan_code,
  trial_started_at,
  trial_ends_at
)
SELECT organization.id, 'active', 'legacy', NULL, NULL
FROM public.organizations AS organization
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.initialize_organization_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.organization_subscriptions(
    organization_id,
    status,
    plan_code,
    trial_started_at,
    trial_ends_at
  ) VALUES (
    NEW.id,
    'trial',
    'trial',
    now(),
    now() + interval '14 days'
  )
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_organization_subscription
  ON public.organizations;
CREATE TRIGGER initialize_organization_subscription
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.initialize_organization_subscription();

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.platform_admins AS administrator
      WHERE administrator.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.assert_platform_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_platform_organizations()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  owner_name text,
  owner_email text,
  subscription_status text,
  plan_code text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  notes text,
  organization_created_at timestamptz,
  member_count bigint,
  client_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_platform_admin();

  RETURN QUERY
  SELECT
    organization.id,
    coalesce(
      nullif(trim(organization.trade_name), ''),
      nullif(trim(organization.legal_name), ''),
      'Empresa sem nome'
    ),
    owner_profile.full_name,
    owner_profile.email,
    subscription.status,
    subscription.plan_code,
    subscription.trial_started_at,
    subscription.trial_ends_at,
    subscription.current_period_ends_at,
    subscription.notes,
    organization.created_at,
    (
      SELECT count(*)
      FROM public.organization_members AS member
      WHERE member.organization_id = organization.id
        AND member.is_active
    ),
    (
      SELECT count(*)
      FROM public.clients AS client
      WHERE client.organization_id = organization.id
        AND client.archived_at IS NULL
    )
  FROM public.organizations AS organization
  JOIN public.organization_subscriptions AS subscription
    ON subscription.organization_id = organization.id
  LEFT JOIN public.profiles AS owner_profile
    ON owner_profile.id = organization.created_by
  WHERE organization.archived_at IS NULL
  ORDER BY organization.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_platform_organization(
  _organization_id uuid,
  _action text,
  _days integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  previous_status text;
  next_status text;
  next_trial_end timestamptz;
BEGIN
  PERFORM public.assert_platform_admin();

  IF _action NOT IN ('activate', 'extend_trial', 'suspend') THEN
    RAISE EXCEPTION 'INVALID_COMMERCIAL_ACTION';
  END IF;
  IF _action = 'extend_trial' AND (_days IS NULL OR _days < 1 OR _days > 90) THEN
    RAISE EXCEPTION 'INVALID_TRIAL_EXTENSION';
  END IF;
  IF _action = 'suspend' AND EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = _organization_id
      AND member.user_id = auth.uid()
      AND member.is_active
  ) THEN
    RAISE EXCEPTION 'CANNOT_SUSPEND_CURRENT_ADMIN_ORGANIZATION';
  END IF;

  SELECT subscription.status
  INTO previous_status
  FROM public.organization_subscriptions AS subscription
  WHERE subscription.organization_id = _organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_SUBSCRIPTION_NOT_FOUND';
  END IF;

  IF _action = 'activate' THEN
    UPDATE public.organization_subscriptions
    SET status = 'active',
        plan_code = CASE WHEN plan_code = 'trial' THEN 'manual' ELSE plan_code END,
        current_period_ends_at = NULL,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE organization_id = _organization_id;
  ELSIF _action = 'extend_trial' THEN
    UPDATE public.organization_subscriptions
    SET status = 'trial',
        plan_code = 'trial',
        trial_started_at = coalesce(trial_started_at, now()),
        trial_ends_at = greatest(coalesce(trial_ends_at, now()), now())
          + make_interval(days => _days),
        current_period_ends_at = NULL,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE organization_id = _organization_id
    RETURNING status, trial_ends_at INTO next_status, next_trial_end;
  ELSE
    UPDATE public.organization_subscriptions
    SET status = 'suspended',
        updated_at = now(),
        updated_by = auth.uid()
    WHERE organization_id = _organization_id;
  END IF;

  SELECT subscription.status, subscription.trial_ends_at
  INTO next_status, next_trial_end
  FROM public.organization_subscriptions AS subscription
  WHERE subscription.organization_id = _organization_id;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    actor_name,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    _organization_id,
    auth.uid(),
    (SELECT profile.full_name FROM public.profiles AS profile WHERE profile.id = auth.uid()),
    'platform.subscription.' || _action,
    'organization_subscription',
    _organization_id,
    jsonb_build_object(
      'previous_status', previous_status,
      'status', next_status,
      'trial_ends_at', next_trial_end,
      'days', _days
    )
  );

  RETURN _organization_id;
END;
$$;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_subscriptions_member_select
ON public.organization_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = organization_subscriptions.organization_id
      AND member.user_id = auth.uid()
      AND member.is_active
  )
);

REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organization_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_subscriptions TO authenticated;

REVOKE ALL ON FUNCTION public.initialize_organization_subscription()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_platform_admin()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_platform_admin()
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_platform_organizations()
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.manage_platform_organization(uuid, text, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_platform_organization(uuid, text, integer)
  TO authenticated;
