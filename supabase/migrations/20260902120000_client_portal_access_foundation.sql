-- Client Portal, stage 1: isolated identity and invitation foundation.
-- Portal users are deliberately NOT organization_members: they do not reserve
-- a paid team seat and cannot inherit internal tenant-wide RLS policies.

CREATE UNIQUE INDEX IF NOT EXISTS clients_organization_id_id_key
  ON public.clients(organization_id, id);

CREATE TABLE public.client_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  invited_by uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_access_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT client_portal_access_identity_key
    UNIQUE (organization_id, client_id, user_id)
);

CREATE INDEX client_portal_access_user_idx
  ON public.client_portal_access(user_id, is_active);
CREATE INDEX client_portal_access_client_idx
  ON public.client_portal_access(organization_id, client_id, is_active);

CREATE TABLE public.client_portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by uuid NOT NULL,
  accepted_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_portal_invitations_client_fkey
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients(organization_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX client_portal_invitations_pending_key
  ON public.client_portal_invitations(organization_id, client_id, lower(email))
  WHERE status = 'pending';
CREATE INDEX client_portal_invitations_email_idx
  ON public.client_portal_invitations(organization_id, lower(email), status);

ALTER TABLE public.client_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_portal_access FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.client_portal_invitations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_portal_access, public.client_portal_invitations TO service_role;
GRANT SELECT (
  id, organization_id, client_id, user_id, email, is_active,
  invited_by, accepted_at, created_at, updated_at
) ON public.client_portal_access TO authenticated;
GRANT SELECT (
  id, organization_id, client_id, email, status, invited_by, accepted_by,
  expires_at, accepted_at, cancelled_at, created_at, updated_at
) ON public.client_portal_invitations TO authenticated;

CREATE POLICY client_portal_access_select
  ON public.client_portal_access
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(
      organization_id,
      ARRAY['proprietario', 'administrador']::public.app_role[]
    )
  );

CREATE POLICY client_portal_invitations_select_admin
  ON public.client_portal_invitations
  FOR SELECT TO authenticated
  USING (
    public.has_org_role(
      organization_id,
      ARRAY['proprietario', 'administrador']::public.app_role[]
    )
  );

CREATE TRIGGER client_portal_access_set_updated_at
  BEFORE UPDATE ON public.client_portal_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER client_portal_invitations_set_updated_at
  BEFORE UPDATE ON public.client_portal_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_client_portal_access(
  _organization_id uuid,
  _client_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.client_portal_access access
      JOIN public.clients client
        ON client.organization_id = access.organization_id
       AND client.id = access.client_id
      JOIN public.organizations organization
        ON organization.id = access.organization_id
     WHERE access.organization_id = _organization_id
       AND access.client_id = _client_id
       AND access.user_id = auth.uid()
       AND access.is_active
       AND client.archived_at IS NULL
       AND organization.archived_at IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.guard_client_portal_invitation_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status <> 'pending' OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.organization_members member
      JOIN public.profiles profile ON profile.id = member.user_id
     WHERE member.organization_id = NEW.organization_id
       AND member.is_active
       AND lower(trim(profile.email)) = lower(trim(NEW.email))
  ) OR EXISTS (
    SELECT 1
      FROM public.organization_invitations invitation
     WHERE invitation.organization_id = NEW.organization_id
       AND invitation.status = 'pending'
       AND invitation.expires_at > now()
       AND lower(trim(invitation.email)) = lower(trim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'PORTAL_IDENTITY_CONFLICT' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER client_portal_invitation_identity_guard
  BEFORE INSERT OR UPDATE OF organization_id, email, status, expires_at
  ON public.client_portal_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_client_portal_invitation_identity();

CREATE OR REPLACE FUNCTION public.guard_team_invitation_portal_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status <> 'pending' OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.client_portal_access access
     WHERE access.organization_id = NEW.organization_id
       AND access.is_active
       AND lower(trim(access.email)) = lower(trim(NEW.email))
  ) OR EXISTS (
    SELECT 1
      FROM public.client_portal_invitations invitation
     WHERE invitation.organization_id = NEW.organization_id
       AND invitation.status = 'pending'
       AND invitation.expires_at > now()
       AND lower(trim(invitation.email)) = lower(trim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'PORTAL_IDENTITY_CONFLICT' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER organization_invitation_portal_identity_guard
  BEFORE INSERT OR UPDATE OF organization_id, email, status, expires_at
  ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_invitation_portal_identity();

CREATE OR REPLACE FUNCTION public.prevent_client_portal_workspace_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email text;
BEGIN
  IF v_caller IS NULL OR NEW.created_by IS DISTINCT FROM v_caller THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.client_portal_access access
     WHERE access.user_id = v_caller
       AND access.is_active
  ) THEN
    RAISE EXCEPTION 'BOOTSTRAP_CLIENT_PORTAL_ACCOUNT' USING ERRCODE = 'P0001';
  END IF;

  SELECT lower(trim(user_account.email))
    INTO v_email
    FROM auth.users user_account
   WHERE user_account.id = v_caller;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.client_portal_invitations invitation
     WHERE lower(trim(invitation.email)) = v_email
       AND invitation.status = 'pending'
       AND invitation.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'BOOTSTRAP_CLIENT_PORTAL_INVITATION_PENDING'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER organizations_client_portal_bootstrap_guard
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_client_portal_workspace_bootstrap();

CREATE OR REPLACE FUNCTION public.create_client_portal_invitation(
  _organization_id uuid,
  _client_id uuid,
  _email text
)
RETURNS TABLE(invitation_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_email text := lower(trim(_email));
  v_token text;
  v_hash text;
  v_id uuid;
  v_exp timestamptz := now() + interval '7 days';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.clients client
      JOIN public.organizations organization
        ON organization.id = client.organization_id
     WHERE client.id = _client_id
       AND client.organization_id = _organization_id
       AND client.archived_at IS NULL
       AND organization.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'PORTAL_CLIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.client_portal_access access
     WHERE access.organization_id = _organization_id
       AND access.client_id = _client_id
       AND access.is_active
       AND lower(trim(access.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_ALREADY_ACTIVE' USING ERRCODE = '23505';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_organization_id::text || ':' || _client_id::text, 20260902)
  );

  UPDATE public.client_portal_invitations invitation
     SET status = 'expired', updated_at = now()
   WHERE invitation.organization_id = _organization_id
     AND invitation.status = 'pending'
     AND invitation.expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  SELECT invitation.id INTO v_id
    FROM public.client_portal_invitations invitation
   WHERE invitation.organization_id = _organization_id
     AND invitation.client_id = _client_id
     AND lower(trim(invitation.email)) = v_email
     AND invitation.status = 'pending'
   FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.client_portal_invitations(
      organization_id, client_id, email, token_hash,
      invited_by, expires_at
    ) VALUES (
      _organization_id, _client_id, v_email, v_hash,
      auth.uid(), v_exp
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.client_portal_invitations invitation
       SET token_hash = v_hash,
           invited_by = auth.uid(),
           expires_at = v_exp,
           updated_at = now()
     WHERE invitation.id = v_id;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'client_portal.invitation_created',
    'client_portal_invitation', v_id, jsonb_build_object('client_id', _client_id)
  );

  RETURN QUERY SELECT v_id, v_token, v_exp;
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_invitation_preview(_token text)
RETURNS TABLE(
  organization_name text,
  client_name text,
  email text,
  status text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT
    COALESCE(organization.trade_name, organization.legal_name),
    client.name,
    invitation.email,
    CASE
      WHEN invitation.status = 'pending' AND invitation.expires_at <= now()
        THEN 'expired'
      ELSE invitation.status
    END,
    invitation.expires_at
  FROM public.client_portal_invitations invitation
  JOIN public.organizations organization ON organization.id = invitation.organization_id
  JOIN public.clients client
    ON client.organization_id = invitation.organization_id
   AND client.id = invitation.client_id
  WHERE invitation.token_hash = encode(extensions.digest(trim(_token), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION public.accept_client_portal_invitation(_token text)
RETURNS TABLE(
  access_id uuid,
  organization_id uuid,
  client_id uuid,
  organization_name text,
  client_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_inv public.client_portal_invitations%ROWTYPE;
  v_user record;
  v_email text;
  v_access public.client_portal_access%ROWTYPE;
  v_org_name text;
  v_client_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF _token IS NULL OR length(trim(_token)) < 32 THEN
    RAISE EXCEPTION 'PORTAL_INVITE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_hash := encode(extensions.digest(trim(_token), 'sha256'), 'hex');
  SELECT invitation.* INTO v_inv
    FROM public.client_portal_invitations invitation
   WHERE invitation.token_hash = v_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PORTAL_INVITE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_inv.organization_id::text || ':' || v_inv.client_id::text, 20260902)
  );
  SELECT invitation.* INTO v_inv
    FROM public.client_portal_invitations invitation
   WHERE invitation.token_hash = v_hash
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_INVITE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'PORTAL_INVITE_CANCELLED'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'PORTAL_INVITE_ALREADY_USED'; END IF;
  IF v_inv.expires_at <= now() THEN
    UPDATE public.client_portal_invitations invitation
       SET status = 'expired', updated_at = now()
     WHERE invitation.id = v_inv.id;
    RAISE EXCEPTION 'PORTAL_INVITE_EXPIRED';
  END IF;

  SELECT user_account.id, user_account.email, user_account.raw_user_meta_data
    INTO v_user
    FROM auth.users user_account
   WHERE user_account.id = v_uid;
  v_email := lower(trim(COALESCE(v_user.email, '')));
  IF v_email = '' OR v_email <> lower(trim(v_inv.email)) THEN
    RAISE EXCEPTION 'PORTAL_INVITE_EMAIL_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.organization_members member
     WHERE member.organization_id = v_inv.organization_id
       AND member.user_id = v_uid
       AND member.is_active
  ) THEN
    RAISE EXCEPTION 'PORTAL_IDENTITY_CONFLICT' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(organization.trade_name, organization.legal_name), client.name
    INTO v_org_name, v_client_name
    FROM public.organizations organization
    JOIN public.clients client
      ON client.organization_id = organization.id
     AND client.id = v_inv.client_id
   WHERE organization.id = v_inv.organization_id
     AND organization.archived_at IS NULL
     AND client.archived_at IS NULL;
  IF v_org_name IS NULL OR v_client_name IS NULL THEN
    RAISE EXCEPTION 'PORTAL_CLIENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.client_portal_invitations invitation
     SET status = 'accepted',
         accepted_by = v_uid,
         accepted_at = now(),
         token_hash = encode(extensions.gen_random_bytes(32), 'hex'),
         updated_at = now()
   WHERE invitation.id = v_inv.id
     AND invitation.status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_INVITE_ALREADY_USED'; END IF;

  INSERT INTO public.profiles AS profile(id, full_name, email)
  VALUES (
    v_uid,
    COALESCE(
      NULLIF(v_user.raw_user_meta_data->>'full_name', ''),
      split_part(v_email, '@', 1)
    ),
    v_email
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(NULLIF(profile.full_name, ''), EXCLUDED.full_name),
        email = COALESCE(NULLIF(profile.email, ''), EXCLUDED.email),
        updated_at = now();

  INSERT INTO public.client_portal_access AS access(
    organization_id, client_id, user_id, email, is_active,
    invited_by, accepted_at
  ) VALUES (
    v_inv.organization_id, v_inv.client_id, v_uid, v_email, true,
    v_inv.invited_by, now()
  )
  ON CONFLICT ON CONSTRAINT client_portal_access_identity_key
  DO UPDATE SET
    email = EXCLUDED.email,
    is_active = true,
    invited_by = EXCLUDED.invited_by,
    accepted_at = now(),
    updated_at = now()
  RETURNING access.* INTO v_access;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    v_inv.organization_id, v_uid, 'client_portal.invitation_accepted',
    'client_portal_access', v_access.id,
    jsonb_build_object('client_id', v_inv.client_id)
  );

  RETURN QUERY SELECT
    v_access.id, v_inv.organization_id, v_inv.client_id,
    v_org_name, v_client_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_client_portal_invitation(_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inv public.client_portal_invitations%ROWTYPE;
BEGIN
  SELECT invitation.* INTO v_inv
    FROM public.client_portal_invitations invitation
   WHERE invitation.id = _invitation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_INVITE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_org_role(
    v_inv.organization_id,
    ARRAY['proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.client_portal_invitations invitation
     SET status = 'cancelled', cancelled_at = now(), updated_at = now()
   WHERE invitation.id = _invitation_id
     AND invitation.status = 'pending';
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_client_portal_access_active(
  _access_id uuid,
  _active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_access public.client_portal_access%ROWTYPE;
BEGIN
  SELECT access.* INTO v_access
    FROM public.client_portal_access access
   WHERE access.id = _access_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PORTAL_ACCESS_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_org_role(
    v_access.organization_id,
    ARRAY['proprietario', 'administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.client_portal_access access
     SET is_active = _active, updated_at = now()
   WHERE access.id = _access_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    v_access.organization_id, auth.uid(),
    CASE WHEN _active
      THEN 'client_portal.access_reactivated'
      ELSE 'client_portal.access_deactivated'
    END,
    'client_portal_access', v_access.id,
    jsonb_build_object('client_id', v_access.client_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.has_client_portal_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_client_portal_access(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_client_portal_invitation(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_client_portal_invitation(uuid, uuid, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.client_portal_invitation_preview(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_portal_invitation_preview(text)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.accept_client_portal_invitation(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_client_portal_invitation(text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_client_portal_invitation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_client_portal_invitation(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_client_portal_access_active(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_client_portal_access_active(uuid, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.guard_client_portal_invitation_identity()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_team_invitation_portal_identity()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_client_portal_workspace_bootstrap()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_client_portal_invitation_identity(),
  public.guard_team_invitation_portal_identity(),
  public.prevent_client_portal_workspace_bootstrap()
  TO postgres;

