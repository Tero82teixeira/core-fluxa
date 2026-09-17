-- Tracks distinct authenticated sessions without exposing tenant data.
-- Refreshing the page in the same auth session updates last_access_at but does
-- not inflate access_count.

BEGIN;

CREATE TABLE public.organization_access_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  first_access_at timestamptz NOT NULL DEFAULT now(),
  last_access_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_access_sessions_session_not_blank
    CHECK (length(trim(session_id)) > 0),
  UNIQUE (organization_id, user_id, session_id)
);

CREATE INDEX organization_access_sessions_org_last_access_idx
  ON public.organization_access_sessions(organization_id, last_access_at DESC);

ALTER TABLE public.organization_access_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_access_sessions
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_organization_access(_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  auth_session_id text := nullif(auth.jwt()->>'session_id', '');
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'ACCESS_SESSION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_org_member(_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  -- Older tokens may not carry session_id. The daily fallback remains stable
  -- across reloads and avoids collecting device or network identifiers.
  auth_session_id := coalesce(
    auth_session_id,
    'legacy:' || caller_id::text || ':' || current_date::text
  );

  INSERT INTO public.organization_access_sessions(
    organization_id,
    user_id,
    session_id,
    first_access_at,
    last_access_at
  )
  VALUES (_organization_id, caller_id, auth_session_id, now(), now())
  ON CONFLICT (organization_id, user_id, session_id) DO UPDATE
    SET last_access_at = greatest(
      public.organization_access_sessions.last_access_at,
      excluded.last_access_at
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_organization_access(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_organization_access(uuid) TO authenticated;

DROP FUNCTION public.platform_organizations();
CREATE FUNCTION public.platform_organizations()
RETURNS TABLE(
  organization_id uuid,
  legal_name text,
  trade_name text,
  owner_name text,
  owner_email text,
  organization_phone text,
  organization_whatsapp text,
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
  last_activity_at timestamptz,
  follow_up_status text,
  next_contact_at timestamptz,
  last_contact_at timestamptz,
  follow_up_notes text,
  first_access_at timestamptz,
  last_access_at timestamptz,
  access_count integer,
  last_access_user_name text,
  last_access_user_email text
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
    organization.id,organization.legal_name,organization.trade_name,
    owner_profile.full_name,owner_profile.email,organization.phone,organization.whatsapp,
    organization.commercial_status,
    CASE WHEN organization.commercial_status='trial' AND organization.trial_ends_at<=now()
      THEN 'expired' ELSE organization.commercial_status END,
    organization.trial_started_at,organization.trial_ends_at,
    CASE WHEN organization.commercial_status<>'trial' THEN NULL ELSE greatest(
      0,ceil(extract(epoch FROM (organization.trial_ends_at-now()))/86400.0)::integer
    ) END,
    organization.onboarding_completed,organization.created_at,organization.archived_at,
    coalesce(usage.client_count,0),coalesce(usage.process_count,0),
    coalesce(usage.task_count,0),coalesce(usage.document_count,0),usage.last_activity_at,
    coalesce(follow_up.status,'not_contacted'),follow_up.next_contact_at,
    follow_up.last_contact_at,follow_up.notes,
    access_summary.first_access_at,access_summary.last_access_at,
    coalesce(access_summary.access_count,0),
    last_access_profile.full_name,last_access_profile.email
  FROM public.organizations organization
  LEFT JOIN public.profiles owner_profile ON owner_profile.id=organization.created_by
  LEFT JOIN public.platform_trial_follow_ups follow_up ON follow_up.organization_id=organization.id
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE activity.source='client')::integer AS client_count,
      count(*) FILTER (WHERE activity.source='process')::integer AS process_count,
      count(*) FILTER (WHERE activity.source='task')::integer AS task_count,
      count(*) FILTER (WHERE activity.source='document')::integer AS document_count,
      max(activity.created_at) AS last_activity_at
    FROM (
      SELECT 'client'::text AS source,client.created_at FROM public.clients client
        WHERE client.organization_id=organization.id AND client.archived_at IS NULL
      UNION ALL SELECT 'process',process.created_at FROM public.processes process
        WHERE process.organization_id=organization.id AND process.archived_at IS NULL
      UNION ALL SELECT 'task',task.created_at FROM public.tasks task
        WHERE task.organization_id=organization.id
      UNION ALL SELECT 'document',document.created_at FROM public.documents document
        WHERE document.organization_id=organization.id AND document.archived_at IS NULL
      UNION ALL SELECT 'audit',log.created_at FROM public.audit_logs log
        WHERE log.organization_id=organization.id AND log.action NOT LIKE 'platform.%'
    ) activity
  ) usage ON true
  LEFT JOIN LATERAL (
    SELECT
      min(access.first_access_at) AS first_access_at,
      max(access.last_access_at) AS last_access_at,
      count(*)::integer AS access_count
    FROM public.organization_access_sessions access
    WHERE access.organization_id=organization.id
  ) access_summary ON true
  LEFT JOIN LATERAL (
    SELECT profile.full_name,profile.email
    FROM public.organization_access_sessions access
    LEFT JOIN public.profiles profile ON profile.id=access.user_id
    WHERE access.organization_id=organization.id
    ORDER BY access.last_access_at DESC,access.id DESC
    LIMIT 1
  ) last_access_profile ON true
  ORDER BY organization.archived_at NULLS FIRST,organization.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_organizations()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_organizations() TO authenticated;

COMMIT;
