-- Commercial follow-up for the FLUXA platform and for each tenant. Platform
-- trial records never mix with tenant opportunities; both are exposed only
-- through scoped RPCs and privacy-safe read models.

BEGIN;

CREATE TABLE public.platform_trial_follow_ups (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_contacted'
    CHECK (status IN ('not_contacted','following','interested','not_interested')),
  next_contact_at timestamptz,
  last_contact_at timestamptz,
  notes text CHECK (notes IS NULL OR length(notes) <= 4000),
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_trial_contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('not_contacted','following','interested','not_interested')),
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','phone','meeting','other')),
  notes text NOT NULL CHECK (length(btrim(notes)) BETWEEN 2 AND 4000),
  next_contact_at timestamptz,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX platform_trial_follow_ups_due_idx
  ON public.platform_trial_follow_ups(next_contact_at)
  WHERE next_contact_at IS NOT NULL AND status NOT IN ('not_interested');
CREATE INDEX platform_trial_contact_history_org_idx
  ON public.platform_trial_contact_history(organization_id, contacted_at DESC);

ALTER TABLE public.commercial_opportunities
  ADD COLUMN contact_status text NOT NULL DEFAULT 'not_contacted'
    CHECK (contact_status IN ('not_contacted','following','interested','not_interested')),
  ADD COLUMN last_contact_at timestamptz;

CREATE TABLE public.commercial_opportunity_contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.commercial_opportunities(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('not_contacted','following','interested','not_interested')),
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','phone','meeting','other')),
  notes text NOT NULL CHECK (length(btrim(notes)) BETWEEN 2 AND 4000),
  next_contact_at timestamptz,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  CONSTRAINT commercial_opportunity_contact_history_scope_fkey
    FOREIGN KEY (organization_id, opportunity_id)
    REFERENCES public.commercial_opportunities(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX commercial_opportunity_contact_history_idx
  ON public.commercial_opportunity_contact_history(organization_id, opportunity_id, contacted_at DESC);

ALTER TABLE public.platform_trial_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_trial_contact_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_opportunity_contact_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_trial_follow_ups,
  public.platform_trial_contact_history,
  public.commercial_opportunity_contact_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_trial_follow_ups,
  public.platform_trial_contact_history,
  public.commercial_opportunity_contact_history TO service_role;

CREATE POLICY commercial_opportunity_contact_history_select
ON public.commercial_opportunity_contact_history FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));
GRANT SELECT ON TABLE public.commercial_opportunity_contact_history TO authenticated;

CREATE FUNCTION public.save_platform_trial_follow_up(
  _organization_id uuid,
  _status text,
  _next_contact_at timestamptz DEFAULT NULL,
  _notes text DEFAULT NULL,
  _channel text DEFAULT NULL,
  _register_contact boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  normalized_notes text := nullif(btrim(coalesce(_notes, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND';
  END IF;
  IF _status NOT IN ('not_contacted','following','interested','not_interested') THEN
    RAISE EXCEPTION 'FOLLOW_UP_STATUS_INVALID';
  END IF;
  IF normalized_notes IS NOT NULL AND length(normalized_notes) > 4000 THEN
    RAISE EXCEPTION 'FOLLOW_UP_NOTES_INVALID';
  END IF;
  IF _register_contact AND (
    _channel NOT IN ('whatsapp','email','phone','meeting','other')
    OR normalized_notes IS NULL OR length(normalized_notes) < 2
  ) THEN
    RAISE EXCEPTION 'CONTACT_DETAILS_REQUIRED';
  END IF;

  INSERT INTO public.platform_trial_follow_ups(
    organization_id,status,next_contact_at,last_contact_at,notes,updated_by
  ) VALUES (
    _organization_id,_status,_next_contact_at,
    CASE WHEN _register_contact THEN now() END,normalized_notes,auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    status=excluded.status,
    next_contact_at=excluded.next_contact_at,
    last_contact_at=CASE WHEN _register_contact THEN now() ELSE platform_trial_follow_ups.last_contact_at END,
    notes=excluded.notes,
    updated_by=auth.uid(),
    updated_at=now();

  IF _register_contact THEN
    INSERT INTO public.platform_trial_contact_history(
      organization_id,status,channel,notes,next_contact_at,created_by
    ) VALUES (
      _organization_id,_status,_channel,normalized_notes,_next_contact_at,auth.uid()
    );
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  VALUES (
    _organization_id,auth.uid(),
    CASE WHEN _register_contact THEN 'platform.trial_contact.recorded' ELSE 'platform.trial_follow_up.updated' END,
    'organization',_organization_id,
    jsonb_build_object('status',_status,'next_contact_at',_next_contact_at,'channel',_channel)
  );
END;
$function$;

CREATE FUNCTION public.platform_trial_contact_history(_organization_id uuid)
RETURNS TABLE(
  id uuid,
  status text,
  channel text,
  notes text,
  next_contact_at timestamptz,
  contacted_at timestamptz,
  created_by uuid,
  created_by_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT history.id,history.status,history.channel,history.notes,
    history.next_contact_at,history.contacted_at,history.created_by,
    coalesce(profile.full_name,profile.email)
  FROM public.platform_trial_contact_history history
  LEFT JOIN public.profiles profile ON profile.id=history.created_by
  WHERE history.organization_id=_organization_id
  ORDER BY history.contacted_at DESC;
END;
$function$;

CREATE FUNCTION public.save_commercial_opportunity_contact(
  _organization_id uuid,
  _opportunity_id uuid,
  _status text,
  _channel text,
  _notes text,
  _next_contact_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  normalized_notes text := nullif(btrim(coalesce(_notes, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_opportunities
    WHERE id=_opportunity_id AND organization_id=_organization_id AND archived_at IS NULL
  ) THEN RAISE EXCEPTION 'OPPORTUNITY_NOT_FOUND'; END IF;
  IF _status NOT IN ('not_contacted','following','interested','not_interested') THEN
    RAISE EXCEPTION 'FOLLOW_UP_STATUS_INVALID';
  END IF;
  IF _channel NOT IN ('whatsapp','email','phone','meeting','other') THEN
    RAISE EXCEPTION 'CONTACT_CHANNEL_INVALID';
  END IF;
  IF normalized_notes IS NULL OR length(normalized_notes) NOT BETWEEN 2 AND 4000 THEN
    RAISE EXCEPTION 'FOLLOW_UP_NOTES_INVALID';
  END IF;

  INSERT INTO public.commercial_opportunity_contact_history(
    organization_id,opportunity_id,status,channel,notes,next_contact_at,created_by
  ) VALUES (
    _organization_id,_opportunity_id,_status,_channel,normalized_notes,_next_contact_at,auth.uid()
  );
  UPDATE public.commercial_opportunities SET
    contact_status=_status,last_contact_at=now(),next_action_at=_next_contact_at,
    updated_at=now(),updated_by=auth.uid()
  WHERE id=_opportunity_id AND organization_id=_organization_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  VALUES (
    _organization_id,auth.uid(),'commercial.opportunity.contact_recorded',
    'commercial_opportunity',_opportunity_id,
    jsonb_build_object('status',_status,'channel',_channel,'next_contact_at',_next_contact_at)
  );
END;
$function$;

CREATE FUNCTION public.commercial_opportunity_contacts(
  _organization_id uuid,
  _opportunity_id uuid
)
RETURNS TABLE(
  id uuid,
  status text,
  channel text,
  notes text,
  next_contact_at timestamptz,
  contacted_at timestamptz,
  created_by uuid,
  created_by_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(_organization_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_opportunities opportunity
    WHERE opportunity.id=_opportunity_id
      AND opportunity.organization_id=_organization_id
  ) THEN RAISE EXCEPTION 'OPPORTUNITY_NOT_FOUND'; END IF;
  RETURN QUERY
  SELECT history.id,history.status,history.channel,history.notes,
    history.next_contact_at,history.contacted_at,history.created_by,
    coalesce(profile.full_name,profile.email)
  FROM public.commercial_opportunity_contact_history history
  LEFT JOIN public.profiles profile ON profile.id=history.created_by
  WHERE history.organization_id=_organization_id
    AND history.opportunity_id=_opportunity_id
  ORDER BY history.contacted_at DESC;
END;
$function$;

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
  follow_up_notes text
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
    follow_up.last_contact_at,follow_up.notes
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
  ORDER BY organization.archived_at NULLS FIRST,organization.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_platform_trial_follow_up(uuid,text,timestamptz,text,text,boolean),
  public.platform_trial_contact_history(uuid),
  public.save_commercial_opportunity_contact(uuid,uuid,text,text,text,timestamptz),
  public.commercial_opportunity_contacts(uuid,uuid),
  public.platform_organizations() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_platform_trial_follow_up(uuid,text,timestamptz,text,text,boolean),
  public.platform_trial_contact_history(uuid),
  public.save_commercial_opportunity_contact(uuid,uuid,text,text,text,timestamptz),
  public.commercial_opportunity_contacts(uuid,uuid),
  public.platform_organizations() TO authenticated;

COMMIT;
