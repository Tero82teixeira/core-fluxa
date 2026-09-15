-- Diagnóstico operacional seguro: último processamento Asaas por organização.

BEGIN;

CREATE OR REPLACE FUNCTION public.organization_asaas_automation_status(
  _organization_id uuid
)
RETURNS TABLE(
  last_run_at timestamptz,
  processed_count integer,
  succeeded_count integer,
  failed_count integer,
  queued_count integer,
  next_attempt_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'ASAAS_AUTOMATION_STATUS_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT max(job.last_attempt_at) AS last_run_at
      FROM public.asaas_charge_jobs job
     WHERE job.organization_id = _organization_id
  ), last_cycle AS (
    SELECT job.status
      FROM public.asaas_charge_jobs job
      CROSS JOIN latest
     WHERE job.organization_id = _organization_id
       AND latest.last_run_at IS NOT NULL
       AND job.last_attempt_at >= latest.last_run_at - interval '5 minutes'
       AND job.last_attempt_at <= latest.last_run_at
  ), queue AS (
    SELECT count(*)::integer AS queued_count,
           min(job.next_attempt_at) AS next_attempt_at
      FROM public.asaas_charge_jobs job
     WHERE job.organization_id = _organization_id
       AND job.status IN ('pending','processing')
  )
  SELECT latest.last_run_at,
         count(last_cycle.status)::integer,
         count(*) FILTER (WHERE last_cycle.status = 'succeeded')::integer,
         count(*) FILTER (WHERE last_cycle.status = 'failed')::integer,
         queue.queued_count,
         queue.next_attempt_at
    FROM latest
    CROSS JOIN queue
    LEFT JOIN last_cycle ON true
   GROUP BY latest.last_run_at, queue.queued_count, queue.next_attempt_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.organization_asaas_automation_status(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_asaas_automation_status(uuid)
  TO authenticated;

COMMIT;
