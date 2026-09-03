-- Client Portal, stage 2: authenticated destination and isolated session shell.
-- This stage exposes only the minimum identity data required to enter the
-- portal. It deliberately does not expose processes, documents or tasks.

CREATE OR REPLACE FUNCTION public.resolve_authenticated_home()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- An internal membership remains the primary destination if an identity is
  -- legitimately linked to different companies in different capacities.
  IF EXISTS (
    SELECT 1
      FROM public.organization_members member
      JOIN public.organizations organization
        ON organization.id = member.organization_id
     WHERE member.user_id = v_uid
       AND member.is_active
       AND organization.archived_at IS NULL
  ) THEN
    RETURN 'workspace';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.client_portal_access access
     WHERE access.user_id = v_uid
  ) THEN
    RETURN 'client_portal';
  END IF;

  SELECT lower(trim(account.email))
    INTO v_email
    FROM auth.users account
   WHERE account.id = v_uid;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.client_portal_invitations invitation
     WHERE lower(trim(invitation.email)) = v_email
       AND invitation.status = 'pending'
       AND invitation.expires_at > now()
  ) THEN
    RETURN 'client_portal';
  END IF;

  RETURN 'workspace';
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_session()
RETURNS TABLE(
  access_id uuid,
  organization_id uuid,
  client_id uuid,
  organization_name text,
  client_name text,
  email text,
  is_active boolean,
  accepted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    access.id,
    access.organization_id,
    access.client_id,
    COALESCE(organization.trade_name, organization.legal_name),
    client.name,
    access.email,
    access.is_active
      AND organization.archived_at IS NULL
      AND client.archived_at IS NULL,
    access.accepted_at
  FROM public.client_portal_access access
  JOIN public.organizations organization
    ON organization.id = access.organization_id
  JOIN public.clients client
    ON client.organization_id = access.organization_id
   AND client.id = access.client_id
  WHERE access.user_id = auth.uid()
  ORDER BY access.accepted_at DESC, access.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_authenticated_home()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_authenticated_home()
  TO authenticated;

REVOKE ALL ON FUNCTION public.client_portal_session()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_portal_session()
  TO authenticated;
