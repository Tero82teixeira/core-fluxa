-- Platform administrators can remove obsolete trial companies from the active
-- commercial view without deleting tenant data. Restores remain explicit and
-- paid/grace-period subscriptions cannot be archived.

BEGIN;

DROP FUNCTION public.platform_organizations();
CREATE FUNCTION public.platform_organizations()
RETURNS TABLE(
  organization_id uuid,
  legal_name text,
  trade_name text,
  owner_name text,
  owner_email text,
  commercial_status text,
  effective_status text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  days_remaining integer,
  onboarding_completed boolean,
  created_at timestamptz,
  archived_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    organization.id,
    organization.legal_name,
    organization.trade_name,
    owner_profile.full_name,
    owner_profile.email,
    organization.commercial_status,
    CASE
      WHEN organization.commercial_status = 'trial'
       AND organization.trial_ends_at <= now() THEN 'expired'
      ELSE organization.commercial_status
    END,
    organization.trial_started_at,
    organization.trial_ends_at,
    CASE
      WHEN organization.commercial_status <> 'trial' THEN NULL
      ELSE greatest(
        0,
        ceil(extract(epoch FROM (organization.trial_ends_at - now())) / 86400.0)::integer
      )
    END,
    organization.onboarding_completed,
    organization.created_at,
    organization.archived_at
  FROM public.organizations organization
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = organization.created_by
  ORDER BY organization.archived_at NULLS FIRST, organization.created_at DESC;
END;
$function$;

CREATE FUNCTION public.set_platform_organization_archived(
  _organization_id uuid,
  _archived boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  previous_archived_at timestamptz;
  previous_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _archived IS NULL THEN
    RAISE EXCEPTION 'ARCHIVE_STATE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT organization.archived_at, organization.commercial_status
    INTO previous_archived_at, previous_status
    FROM public.organizations organization
   WHERE organization.id = _organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF _archived AND previous_archived_at IS NULL AND EXISTS (
    SELECT 1
      FROM public.organization_subscriptions subscription
     WHERE subscription.organization_id = _organization_id
       AND (
         subscription.status IN ('active', 'past_due')
         OR (
           subscription.status = 'canceled'
           AND subscription.access_until IS NOT NULL
           AND subscription.access_until > now()
         )
       )
  ) THEN
    RAISE EXCEPTION 'SUBSCRIPTION_ACCESS_STILL_ACTIVE' USING ERRCODE = '55000';
  END IF;

  IF _archived AND previous_archived_at IS NULL THEN
    UPDATE public.organizations
       SET archived_at = now(),
           commercial_status = 'suspended',
           updated_at = now()
     WHERE id = _organization_id;
  ELSIF NOT _archived AND previous_archived_at IS NOT NULL THEN
    UPDATE public.organizations
       SET archived_at = NULL,
           commercial_status = 'suspended',
           updated_at = now()
     WHERE id = _organization_id;
  ELSE
    RETURN;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id,
    auth.uid(),
    CASE
      WHEN _archived THEN 'platform.organization.archived'
      ELSE 'platform.organization.restored'
    END,
    'organization',
    _organization_id,
    jsonb_build_object(
      'archived', _archived,
      'previous_archived_at', previous_archived_at,
      'previous_status', previous_status
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_organizations()
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_platform_organization_archived(uuid, boolean)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.platform_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_platform_organization_archived(uuid, boolean)
  TO authenticated;

COMMIT;
