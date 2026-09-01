-- Expose a minimal, read-only view of Kiwify processing health to platform
-- administrators. The raw webhook payload and buyer personal data remain
-- inaccessible to browser sessions.

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_kiwify_event_health(
  _limit integer DEFAULT 20
)
RETURNS TABLE (
  event_key text,
  organization_id uuid,
  organization_name text,
  event_type text,
  received_at timestamptz,
  processed_at timestamptz,
  outcome text,
  diagnostic_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _limit IS NULL OR _limit < 1 OR _limit > 100 THEN
    RAISE EXCEPTION 'INVALID_EVENT_LIMIT' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT event.event_key,
         event.organization_id,
         COALESCE(organization.trade_name, organization.legal_name),
         event.event_type,
         event.received_at,
         event.processed_at,
         CASE
           WHEN event.processing_error IS NULL AND event.processed_at IS NOT NULL
             THEN 'processed'
           WHEN right(event.processing_error, 8) = '_IGNORED'
             THEN 'ignored'
           ELSE 'attention'
         END,
         event.processing_error
    FROM public.kiwify_webhook_events event
    LEFT JOIN public.organizations organization
      ON organization.id = event.organization_id
   ORDER BY event.received_at DESC, event.event_key DESC
   LIMIT _limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_kiwify_event_health(integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_kiwify_event_health(integer)
  TO authenticated;

COMMIT;
