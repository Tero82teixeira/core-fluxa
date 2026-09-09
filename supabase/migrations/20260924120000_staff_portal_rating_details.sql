-- Detailed client portal ratings for company service reports.

CREATE OR REPLACE FUNCTION public.list_staff_client_portal_communication_ratings(
  _organization_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE (
  rating_id uuid,
  client_id uuid,
  client_name text,
  thread_id uuid,
  subject text,
  rating smallint,
  comment text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  PERFORM public.communication_assert_role(_organization_id, true);
  IF _from IS NULL OR _to IS NULL OR _from > _to OR _to - _from > interval '370 days' THEN
    RAISE EXCEPTION 'REPORT_PERIOD_INVALID';
  END IF;

  RETURN QUERY
  SELECT rating_row.id,
         rating_row.client_id,
         client.name,
         rating_row.thread_id,
         thread.subject,
         rating_row.rating,
         rating_row.comment,
         rating_row.created_at,
         rating_row.updated_at
    FROM public.client_portal_communication_ratings AS rating_row
    JOIN public.clients AS client
      ON client.organization_id = rating_row.organization_id
     AND client.id = rating_row.client_id
    JOIN public.communication_threads AS thread
      ON thread.organization_id = rating_row.organization_id
     AND thread.client_id = rating_row.client_id
     AND thread.id = rating_row.thread_id
   WHERE rating_row.organization_id = _organization_id
     AND rating_row.created_at >= _from
     AND rating_row.created_at < _to + interval '1 day'
   ORDER BY rating_row.created_at DESC, rating_row.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_staff_client_portal_communication_ratings(uuid,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff_client_portal_communication_ratings(uuid,timestamptz,timestamptz)
  TO authenticated;
