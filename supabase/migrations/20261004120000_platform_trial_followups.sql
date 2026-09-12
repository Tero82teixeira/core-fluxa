-- Private commercial follow-up for trial organizations. Tenant users never see
-- this data; each tenant keeps using its own clients, opportunities and proposals.

BEGIN;

CREATE TABLE public.platform_trial_followups (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_contacted'
    CHECK (status IN ('not_contacted', 'following', 'interested', 'not_interested')),
  next_contact_at timestamptz,
  last_contact_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT platform_trial_followups_notes_length
    CHECK (notes IS NULL OR char_length(notes) <= 4000)
);

CREATE INDEX platform_trial_followups_next_contact_idx
  ON public.platform_trial_followups(next_contact_at)
  WHERE next_contact_at IS NOT NULL;

ALTER TABLE public.platform_trial_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_trial_followups FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.platform_trial_followups()
RETURNS TABLE(
  organization_id uuid,
  status text,
  next_contact_at timestamptz,
  last_contact_at timestamptz,
  notes text,
  updated_at timestamptz
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
    followup.organization_id,
    followup.status,
    followup.next_contact_at,
    followup.last_contact_at,
    followup.notes,
    followup.updated_at
  FROM public.platform_trial_followups followup
  ORDER BY followup.next_contact_at NULLS LAST, followup.updated_at DESC;
END;
$function$;

CREATE FUNCTION public.save_platform_trial_followup(
  _organization_id uuid,
  _status text,
  _next_contact_at timestamptz DEFAULT NULL,
  _notes text DEFAULT NULL,
  _mark_contacted boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  normalized_notes text := nullif(btrim(coalesce(_notes, '')), '');
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('not_contacted', 'following', 'interested', 'not_interested') THEN
    RAISE EXCEPTION 'INVALID_FOLLOWUP_STATUS' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(normalized_notes, '')) > 4000 THEN
    RAISE EXCEPTION 'FOLLOWUP_NOTES_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations organization
    WHERE organization.id = _organization_id AND organization.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.platform_trial_followups(
    organization_id, status, next_contact_at, last_contact_at, notes, updated_by
  )
  VALUES (
    _organization_id,
    _status,
    _next_contact_at,
    CASE WHEN _mark_contacted THEN now() ELSE NULL END,
    normalized_notes,
    auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    status = EXCLUDED.status,
    next_contact_at = EXCLUDED.next_contact_at,
    last_contact_at = CASE
      WHEN _mark_contacted THEN now()
      ELSE public.platform_trial_followups.last_contact_at
    END,
    notes = EXCLUDED.notes,
    updated_at = now(),
    updated_by = auth.uid();

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'platform.trial_followup.updated',
    'organization',
    _organization_id,
    jsonb_build_object('status', _status, 'next_contact_at', _next_contact_at)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_trial_followups() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.save_platform_trial_followup(uuid, text, timestamptz, text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_trial_followups() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_trial_followup(uuid, text, timestamptz, text, boolean)
  TO authenticated;

-- Expose the owner's phone only to the platform administrator, alongside the
-- aggregate trial-adoption fields already returned by this private RPC.
DROP FUNCTION public.platform_organizations();

CREATE FUNCTION public.platform_organizations()
RETURNS TABLE(
  organization_id uuid,
  legal_name text,
  trade_name text,
  owner_name text,
  owner_email text,
  owner_phone text,
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
    owner_profile.phone,
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

REVOKE ALL ON FUNCTION public.platform_organizations() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_organizations() TO authenticated;

COMMIT;
