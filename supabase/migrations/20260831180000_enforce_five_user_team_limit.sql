-- Enforce the commercial Essencial plan limit at the database boundary.
-- Active members and non-expired pending invitations each reserve one seat.

CREATE OR REPLACE FUNCTION public.enforce_organization_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  reserved_seats integer;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.is_active
     AND OLD.organization_id = NEW.organization_id
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.organization_id::text, 20260831)
  );

  SELECT
    (
      SELECT count(*)
        FROM public.organization_members member
       WHERE member.organization_id = NEW.organization_id
         AND member.is_active
    ) + (
      SELECT count(*)
        FROM public.organization_invitations invitation
       WHERE invitation.organization_id = NEW.organization_id
         AND invitation.status = 'pending'
         AND invitation.expires_at > now()
    )
    INTO reserved_seats;

  IF reserved_seats >= 5 THEN
    RAISE EXCEPTION 'ORGANIZATION_MEMBER_LIMIT_REACHED'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS organization_members_limit_guard
  ON public.organization_members;
CREATE TRIGGER organization_members_limit_guard
  BEFORE INSERT OR UPDATE OF is_active, organization_id
  ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_organization_member_limit();

REVOKE ALL ON FUNCTION public.enforce_organization_member_limit()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_organization_member_limit()
  TO postgres;

CREATE OR REPLACE FUNCTION public.enforce_organization_invitation_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  reserved_seats integer;
BEGIN
  IF NEW.status <> 'pending' OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.organization_id = NEW.organization_id
     AND OLD.status = 'pending'
     AND OLD.expires_at > now()
  THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.organization_id::text, 20260831)
  );

  SELECT
    (
      SELECT count(*)
        FROM public.organization_members member
       WHERE member.organization_id = NEW.organization_id
         AND member.is_active
    ) + (
      SELECT count(*)
        FROM public.organization_invitations invitation
       WHERE invitation.organization_id = NEW.organization_id
         AND invitation.status = 'pending'
         AND invitation.expires_at > now()
    )
    INTO reserved_seats;

  IF reserved_seats >= 5 THEN
    RAISE EXCEPTION 'ORGANIZATION_MEMBER_LIMIT_REACHED'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS organization_invitations_limit_guard
  ON public.organization_invitations;
CREATE TRIGGER organization_invitations_limit_guard
  BEFORE INSERT OR UPDATE OF organization_id, status, expires_at
  ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_organization_invitation_limit();

REVOKE ALL ON FUNCTION public.enforce_organization_invitation_limit()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_organization_invitation_limit()
  TO postgres;

CREATE OR REPLACE FUNCTION public.create_invitation(
  _org uuid,
  _email text,
  _role public.app_role
)
RETURNS TABLE(
  invitation_id uuid,
  token text,
  expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE
  v_token text;
  v_hash text;
  v_email text := lower(trim(_email));
  v_id uuid;
  v_exp timestamptz := now() + interval '7 days';
  v_actor text;
  v_reserved_seats integer;
  v_existing_pending boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.organization_members
     WHERE organization_id = _org
       AND user_id = auth.uid()
       AND is_active
       AND role IN ('proprietario', 'administrador')
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _role NOT IN ('administrador', 'gestor', 'operacional', 'visualizador') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;
  IF _role = 'administrador'
     AND NOT public.has_org_role(
       _org,
       ARRAY['proprietario']::public.app_role[]
     )
  THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.organization_members member
      JOIN public.profiles profile ON profile.id = member.user_id
     WHERE member.organization_id = _org
       AND lower(profile.email) = v_email
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_org::text, 20260831));

  UPDATE public.organization_invitations invitation
     SET status = 'expired',
         updated_at = now()
   WHERE invitation.organization_id = _org
     AND invitation.status = 'pending'
     AND invitation.expires_at < now();

  SELECT EXISTS (
    SELECT 1
      FROM public.organization_invitations invitation
     WHERE invitation.organization_id = _org
       AND lower(invitation.email) = v_email
       AND invitation.status = 'pending'
       AND invitation.expires_at > now()
  ) INTO v_existing_pending;

  SELECT
    (
      SELECT count(*)
        FROM public.organization_members member
       WHERE member.organization_id = _org
         AND member.is_active
    ) + (
      SELECT count(*)
        FROM public.organization_invitations invitation
       WHERE invitation.organization_id = _org
         AND invitation.status = 'pending'
         AND invitation.expires_at > now()
    ) + CASE WHEN v_existing_pending THEN 0 ELSE 1 END
    INTO v_reserved_seats;

  IF v_reserved_seats > 5 THEN
    RAISE EXCEPTION 'ORGANIZATION_MEMBER_LIMIT_REACHED'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT profile.full_name
    INTO v_actor
    FROM public.profiles profile
   WHERE profile.id = auth.uid();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.organization_invitations AS invitation (
    organization_id,
    email,
    role,
    token_hash,
    invited_by,
    invited_by_name,
    expires_at
  ) VALUES (
    _org,
    v_email,
    _role,
    v_hash,
    auth.uid(),
    v_actor,
    v_exp
  )
  ON CONFLICT (organization_id, lower(email)) WHERE status = 'pending'
  DO UPDATE SET
    role = EXCLUDED.role,
    token_hash = EXCLUDED.token_hash,
    invited_by = EXCLUDED.invited_by,
    invited_by_name = EXCLUDED.invited_by_name,
    expires_at = EXCLUDED.expires_at,
    updated_at = now()
  RETURNING invitation.id INTO v_id;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    actor_name,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    _org,
    auth.uid(),
    v_actor,
    'invite.created',
    'invitation',
    v_id,
    jsonb_build_object('email', v_email, 'role', _role)
  );

  RETURN QUERY SELECT v_id, v_token, v_exp;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invitation(
  uuid, text, public.app_role
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(
  uuid, text, public.app_role
) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS TABLE(
  organization_id uuid,
  membership_id uuid,
  role public.app_role,
  organization_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_inv public.organization_invitations%ROWTYPE;
  v_user record;
  v_email text;
  v_name text;
  v_membership public.organization_members%ROWTYPE;
  v_org_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF _token IS NULL OR length(trim(_token)) < 32 THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  v_hash := encode(extensions.digest(trim(_token), 'sha256'), 'hex');

  SELECT invitation.* INTO v_inv
    FROM public.organization_invitations invitation
   WHERE invitation.token_hash = v_hash;

  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;

  -- Every operation that consumes or reserves a seat acquires the organization
  -- lock before any invitation row lock, preventing lock-order deadlocks.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_inv.organization_id::text, 20260831)
  );

  SELECT invitation.* INTO v_inv
    FROM public.organization_invitations invitation
   WHERE invitation.token_hash = v_hash
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'INVITE_CANCELLED'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'INVITE_ALREADY_USED'; END IF;
  IF v_inv.expires_at <= now() THEN
    UPDATE public.organization_invitations invitation
       SET status = 'expired', updated_at = now()
     WHERE invitation.id = v_inv.id
       AND invitation.status = 'pending';
    RAISE EXCEPTION 'INVITE_EXPIRED';
  END IF;

  SELECT user_account.id, user_account.email, user_account.raw_user_meta_data
    INTO v_user
    FROM auth.users user_account
   WHERE user_account.id = v_uid;
  v_email := lower(trim(COALESCE(v_user.email, '')));
  IF v_email = '' OR v_email <> lower(trim(v_inv.email)) THEN
    RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH';
  END IF;
  v_name := COALESCE(
    NULLIF(v_user.raw_user_meta_data->>'full_name', ''),
    split_part(v_email, '@', 1)
  );

  SELECT COALESCE(organization.trade_name, organization.legal_name)
    INTO v_org_name
    FROM public.organizations organization
   WHERE organization.id = v_inv.organization_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'INVITE_ORGANIZATION_NOT_FOUND';
  END IF;

  -- Remove this invitation's reservation before activating its member. Any
  -- later error rolls back both changes and leaves the invitation pending.
  UPDATE public.organization_invitations invitation
     SET status = 'accepted',
         accepted_at = now(),
         accepted_by = v_uid,
         updated_at = now(),
         token_hash = encode(extensions.gen_random_bytes(32), 'hex')
   WHERE invitation.id = v_inv.id
     AND invitation.status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_ALREADY_USED'; END IF;

  INSERT INTO public.profiles AS profile (id, full_name, email)
  VALUES (v_uid, v_name, v_email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(NULLIF(profile.full_name, ''), EXCLUDED.full_name),
        email = COALESCE(NULLIF(profile.email, ''), EXCLUDED.email),
        updated_at = now();

  SELECT member.* INTO v_membership
    FROM public.organization_members member
   WHERE member.organization_id = v_inv.organization_id
     AND member.user_id = v_uid
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.organization_members member
       SET is_active = true,
           role = CASE WHEN member.is_active THEN member.role ELSE v_inv.role END,
           updated_at = now()
     WHERE member.id = v_membership.id
     RETURNING member.* INTO v_membership;
  ELSE
    INSERT INTO public.organization_members AS member (
      organization_id,
      user_id,
      role,
      is_active
    ) VALUES (
      v_inv.organization_id,
      v_uid,
      v_inv.role,
      true
    )
    ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key
    DO UPDATE SET
      is_active = true,
      role = EXCLUDED.role,
      updated_at = now()
    RETURNING member.* INTO v_membership;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    actor_name,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    v_inv.organization_id,
    v_uid,
    v_name,
    'invite.accepted',
    'member',
    v_membership.user_id,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'membership_id', v_membership.id,
      'role', v_membership.role
    )
  );

  IF v_inv.invited_by IS NOT NULL THEN
    INSERT INTO public.notifications(
      organization_id,
      user_id,
      kind,
      title,
      body,
      action_url,
      dedupe_key
    ) VALUES (
      v_inv.organization_id,
      v_inv.invited_by,
      'team',
      'Convite aceito',
      v_name || ' entrou para a equipe.',
      '/equipe',
      'invite-accepted-' || v_inv.id::text
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY SELECT
    v_inv.organization_id,
    v_membership.id,
    v_membership.role,
    v_org_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
