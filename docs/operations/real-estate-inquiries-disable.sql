-- Suspende somente novos formulários; preserva a fila, agenda e a vitrine.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.real_estate_submit_inquiry(uuid,uuid,uuid,jsonb) FROM anon,authenticated;
REVOKE EXECUTE ON FUNCTION fluxa_inquiry_private.submit(uuid,uuid,uuid,jsonb) FROM anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
