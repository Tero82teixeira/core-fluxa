-- Permite que administradores validem a Central de Notificações sem escolher destinatário ou conteúdo.
CREATE OR REPLACE FUNCTION public.create_test_notification(_organization uuid)
RETURNS TABLE(notification_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_notification_id uuid := gen_random_uuid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = _organization
      AND member.user_id = v_actor
      AND member.is_active
      AND member.role IN ('proprietario', 'administrador')
  ) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  INSERT INTO public.notifications (
    id,
    organization_id,
    user_id,
    kind,
    title,
    body,
    action_url,
    dedupe_key
  ) VALUES (
    v_notification_id,
    _organization,
    v_actor,
    'system',
    'Notificação de teste',
    'Esta é uma notificação de teste da FLUXA. O sino e a Central de Notificações estão funcionando corretamente.',
    '/notificacoes',
    'test-notification-' || v_notification_id::text
  );

  INSERT INTO public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    metadata
  ) VALUES (
    _organization,
    v_actor,
    'notification.test_created',
    'notification',
    v_notification_id,
    jsonb_build_object('kind', 'system', 'recipient', 'self')
  );

  RETURN QUERY SELECT v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_test_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_test_notification(uuid) TO authenticated;
