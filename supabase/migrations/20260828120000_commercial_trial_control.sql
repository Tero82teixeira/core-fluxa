-- PR #136: teste comercial controlado e administração segura da plataforma.

ALTER TABLE public.organizations
  ADD COLUMN commercial_status text,
  ADD COLUMN trial_started_at timestamptz,
  ADD COLUMN trial_ends_at timestamptz;

-- Tudo que já existia antes desta entrega permanece ativo e sem prazo.
UPDATE public.organizations
   SET commercial_status = 'active',
       trial_started_at = NULL,
       trial_ends_at = NULL;

ALTER TABLE public.organizations
  ALTER COLUMN commercial_status SET DEFAULT 'trial',
  ALTER COLUMN commercial_status SET NOT NULL,
  ALTER COLUMN trial_started_at SET DEFAULT now(),
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days'),
  ADD CONSTRAINT organizations_commercial_status_check
    CHECK (commercial_status IN ('trial', 'active', 'suspended')),
  ADD CONSTRAINT organizations_trial_period_check
    CHECK (
      commercial_status <> 'trial'
      OR (
        trial_started_at IS NOT NULL
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > trial_started_at
      )
    );

CREATE INDEX organizations_commercial_status_idx
  ON public.organizations(commercial_status, trial_ends_at)
  WHERE archived_at IS NULL;

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;

-- Preserva uma eventual configuração anterior feita com o papel superadmin.
INSERT INTO public.platform_admins(user_id, created_by)
SELECT DISTINCT m.user_id, m.user_id
  FROM public.organization_members m
 WHERE m.role = 'superadmin'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.platform_admins administrator
        WHERE administrator.user_id = auth.uid()
     );
$function$;

CREATE OR REPLACE FUNCTION public.has_org_membership(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.organization_members member
        WHERE member.organization_id = _org
          AND member.user_id = auth.uid()
          AND member.is_active
     );
$function$;

CREATE OR REPLACE FUNCTION public.organization_has_commercial_access(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.organizations organization
     WHERE organization.id = _org
       AND organization.archived_at IS NULL
       AND (
         organization.commercial_status = 'active'
         OR (
           organization.commercial_status = 'trial'
           AND organization.trial_ends_at > now()
         )
       )
  );
$function$;

-- Os helpers centrais passam a negar dados operacionais quando o contrato não
-- está ativo. A leitura da própria organização permanece disponível para que a
-- aplicação consiga mostrar a mensagem correta de bloqueio.
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.has_org_membership(_org)
     AND public.organization_has_commercial_access(_org);
$function$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.organization_has_commercial_access(_org)
     AND EXISTS (
       SELECT 1
         FROM public.organization_members member
        WHERE member.organization_id = _org
          AND member.user_id = auth.uid()
          AND member.is_active
          AND member.role = ANY(_roles)
     );
$function$;

DROP POLICY IF EXISTS orgs_select_member ON public.organizations;
CREATE POLICY orgs_select_member
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.has_org_membership(id) OR public.is_platform_admin());

DROP POLICY IF EXISTS members_select_own_orgs ON public.organization_members;
DROP POLICY IF EXISTS members_select_org ON public.organization_members;
CREATE POLICY members_select_org
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_member(organization_id)
    OR public.is_platform_admin()
  );

-- Corrige as poucas políticas legadas que consultavam o vínculo diretamente,
-- sem passar pelos helpers comerciais centrais.
DROP POLICY IF EXISTS automation_rules_read ON public.automation_rules;
CREATE POLICY automation_rules_read
  ON public.automation_rules FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS automation_executions_read ON public.automation_executions;
CREATE POLICY automation_executions_read
  ON public.automation_executions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS automation_schedules_read ON public.automation_schedules;
CREATE POLICY automation_schedules_read
  ON public.automation_schedules FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

DROP POLICY IF EXISTS support_requests_select ON public.support_requests;
CREATE POLICY support_requests_select
  ON public.support_requests FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      created_by = auth.uid()
      OR public.has_org_role(
        organization_id,
        ARRAY['superadmin', 'proprietario', 'administrador', 'gestor']::public.app_role[]
      )
    )
  );

CREATE OR REPLACE FUNCTION public.automation_can_manage(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.has_org_role(
    _org,
    ARRAY['proprietario', 'administrador', 'superadmin']::public.app_role[]
  );
$function$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  UPDATE public.notifications notification
     SET read_at = COALESCE(notification.read_at, now())
   WHERE notification.id = _notification
     AND notification.user_id = auth.uid()
     AND public.is_org_member(notification.organization_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(_organization uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  affected integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(_organization) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.notifications
     SET read_at = now()
   WHERE organization_id = _organization
     AND user_id = auth.uid()
     AND read_at IS NULL
     AND archived_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_notification(_notification uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  UPDATE public.notifications notification
     SET archived_at = COALESCE(notification.archived_at, now())
   WHERE notification.id = _notification
     AND notification.user_id = auth.uid()
     AND public.is_org_member(notification.organization_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_organizations()
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
  created_at timestamptz
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
      ELSE greatest(0, ceil(extract(epoch FROM (organization.trial_ends_at - now())) / 86400.0)::integer)
    END,
    organization.onboarding_completed,
    organization.created_at
  FROM public.organizations organization
  LEFT JOIN public.profiles owner_profile ON owner_profile.id = organization.created_by
  WHERE organization.archived_at IS NULL
  ORDER BY organization.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_organization_commercial_status(
  _organization_id uuid,
  _action text,
  _days integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  previous_status text;
  previous_trial_ends_at timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _action NOT IN ('activate', 'suspend', 'extend_trial') THEN
    RAISE EXCEPTION 'INVALID_COMMERCIAL_ACTION' USING ERRCODE = '22023';
  END IF;
  IF _action = 'extend_trial' AND (_days IS NULL OR _days < 1 OR _days > 365) THEN
    RAISE EXCEPTION 'INVALID_TRIAL_EXTENSION' USING ERRCODE = '22023';
  END IF;

  SELECT organization.commercial_status, organization.trial_ends_at
    INTO previous_status, previous_trial_ends_at
    FROM public.organizations organization
   WHERE organization.id = _organization_id
     AND organization.archived_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF _action = 'activate' THEN
    UPDATE public.organizations
       SET commercial_status = 'active',
           trial_started_at = NULL,
           trial_ends_at = NULL,
           updated_at = now()
     WHERE id = _organization_id;
  ELSIF _action = 'suspend' THEN
    UPDATE public.organizations
       SET commercial_status = 'suspended',
           updated_at = now()
     WHERE id = _organization_id;
  ELSE
    UPDATE public.organizations
       SET commercial_status = 'trial',
           trial_started_at = COALESCE(trial_started_at, now()),
           trial_ends_at = greatest(COALESCE(trial_ends_at, now()), now()) + make_interval(days => _days),
           updated_at = now()
     WHERE id = _organization_id;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id,
    auth.uid(),
    'platform.organization.commercial_status_changed',
    'organization',
    _organization_id,
    jsonb_build_object(
      'commercial_action', _action,
      'days', _days,
      'previous_status', previous_status,
      'previous_trial_ends_at', previous_trial_ends_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.has_org_membership(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.organization_has_commercial_access(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, public.app_role[]) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.platform_organizations() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_organization_commercial_status(uuid, text, integer) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.automation_can_manage(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.archive_notification(uuid) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_commercial_status(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.automation_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_notification(uuid) TO authenticated;
