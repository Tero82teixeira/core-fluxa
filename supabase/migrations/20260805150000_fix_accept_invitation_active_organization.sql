-- Fix invitation acceptance so invited users join the inviter organization with the invited role.
-- Additive/safe: preserves existing rows and only replaces RPC contracts.

ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS accepted_by uuid;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS TABLE(organization_id uuid, membership_id uuid, role public.app_role, organization_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_hash text;
  v_inv public.organization_invitations%ROWTYPE;
  v_user record;
  v_email text;
  v_name text;
  v_membership public.organization_members%ROWTYPE;
  v_org_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF _token IS NULL OR length(trim(_token)) < 32 THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  v_hash := encode(extensions.digest(trim(_token), 'sha256'), 'hex');

  SELECT * INTO v_inv
    FROM public.organization_invitations
   WHERE token_hash = v_hash
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'INVITE_CANCELLED'; END IF;
  IF v_inv.status IN ('accepted','expired') THEN RAISE EXCEPTION 'INVITE_ALREADY_USED'; END IF;
  IF v_inv.status <> 'pending' THEN RAISE EXCEPTION 'INVITE_ALREADY_USED'; END IF;
  IF v_inv.expires_at <= now() THEN
    UPDATE public.organization_invitations
       SET status = 'expired', updated_at = now()
     WHERE id = v_inv.id AND status = 'pending';
    RAISE EXCEPTION 'INVITE_EXPIRED';
  END IF;

  SELECT u.id, u.email, u.raw_user_meta_data INTO v_user
    FROM auth.users u
   WHERE u.id = auth.uid();
  v_email := lower(trim(COALESCE(v_user.email, '')));
  IF v_email = '' OR v_email <> lower(trim(v_inv.email)) THEN
    RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH';
  END IF;
  v_name := COALESCE(NULLIF(v_user.raw_user_meta_data->>'full_name', ''), split_part(v_email, '@', 1));

  SELECT COALESCE(o.trade_name, o.legal_name) INTO v_org_name
    FROM public.organizations o
   WHERE o.id = v_inv.organization_id;
  IF v_org_name IS NULL THEN RAISE EXCEPTION 'INVITE_ORGANIZATION_NOT_FOUND'; END IF;

  INSERT INTO public.profiles AS p (id, full_name, email)
  VALUES (auth.uid(), v_name, v_email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(NULLIF(p.full_name, ''), EXCLUDED.full_name),
        email = COALESCE(NULLIF(p.email, ''), EXCLUDED.email),
        updated_at = now();

  SELECT * INTO v_membership
    FROM public.organization_members
   WHERE organization_id = v_inv.organization_id AND user_id = auth.uid()
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.organization_members
       SET is_active = true,
           role = CASE WHEN v_membership.is_active THEN v_membership.role ELSE v_inv.role END,
           updated_at = now()
     WHERE id = v_membership.id
     RETURNING * INTO v_membership;
  ELSE
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_inv.organization_id, auth.uid(), v_inv.role, true)
    ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key
    DO UPDATE SET is_active = true, updated_at = now()
    RETURNING * INTO v_membership;
  END IF;

  UPDATE public.organization_invitations
     SET status = 'accepted',
         accepted_at = now(),
         accepted_by = auth.uid(),
         updated_at = now(),
         token_hash = encode(extensions.gen_random_bytes(32), 'hex')
   WHERE id = v_inv.id AND status = 'pending'
   RETURNING * INTO v_inv;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_ALREADY_USED'; END IF;

  INSERT INTO public.audit_logs (organization_id, actor_id, actor_name, action, entity, entity_id, metadata)
  VALUES (v_inv.organization_id, auth.uid(), v_name, 'invite.accepted', 'member', v_membership.user_id,
          jsonb_build_object('invitation_id', v_inv.id, 'membership_id', v_membership.id, 'role', v_membership.role));

  INSERT INTO public.notifications (organization_id, user_id, kind, title, body, dedupe_key)
  VALUES (v_inv.organization_id, v_inv.invited_by, 'team', 'Convite aceito', v_name || ' entrou para a equipe.', 'invite-accepted-' || v_inv.id::text)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_inv.organization_id, v_membership.id, v_membership.role, v_org_name;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pending_invitation_diagnostics()
RETURNS TABLE(invitation_id uuid, organization_id uuid, email text, role public.app_role, matched_user_id uuid, has_membership boolean, accessed_by_user boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT i.id, i.organization_id, i.email, i.role, u.id,
         EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = i.organization_id AND m.user_id = u.id),
         false
    FROM public.organization_invitations i
    JOIN auth.users u ON lower(trim(u.email)) = lower(trim(i.email))
   WHERE i.status = 'pending';
$$;
REVOKE ALL ON FUNCTION public.pending_invitation_diagnostics() FROM PUBLIC, anon, authenticated;
