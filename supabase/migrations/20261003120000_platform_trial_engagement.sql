-- Gives the platform owner a privacy-safe view of trial adoption without
-- exposing tenant records. Only aggregate counts and the latest activity time
-- leave each organization boundary.

BEGIN;

DROP FUNCTION IF EXISTS public.platform_organizations();

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
  archived_at timestamptz,
  client_count integer,
  process_count integer,
  task_count integer,
  document_count integer,
  last_activity_at timestamptz
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
    organization.archived_at,
    COALESCE(usage.client_count, 0),
    COALESCE(usage.process_count, 0),
    COALESCE(usage.task_count, 0),
    COALESCE(usage.document_count, 0),
    usage.last_activity_at
  FROM public.organizations organization
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = organization.created_by
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE activity.source = 'client')::integer AS client_count,
      count(*) FILTER (WHERE activity.source = 'process')::integer AS process_count,
      count(*) FILTER (WHERE activity.source = 'task')::integer AS task_count,
      count(*) FILTER (WHERE activity.source = 'document')::integer AS document_count,
      max(activity.created_at) AS last_activity_at
    FROM (
      SELECT 'client'::text AS source, client.created_at
      FROM public.clients client
      WHERE client.organization_id = organization.id AND client.archived_at IS NULL
      UNION ALL
      SELECT 'process', process.created_at
      FROM public.processes process
      WHERE process.organization_id = organization.id AND process.archived_at IS NULL
      UNION ALL
      SELECT 'task', task.created_at
      FROM public.tasks task
      WHERE task.organization_id = organization.id
      UNION ALL
      SELECT 'document', document.created_at
      FROM public.documents document
      WHERE document.organization_id = organization.id AND document.archived_at IS NULL
      UNION ALL
      SELECT 'audit', log.created_at
      FROM public.audit_logs log
      WHERE log.organization_id = organization.id
        AND log.action NOT LIKE 'platform.%'
    ) activity
  ) usage ON true
  ORDER BY organization.archived_at NULLS FIRST, organization.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_organizations()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_organizations() TO authenticated;

COMMIT;
