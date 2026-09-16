-- Visão operacional consolidada das integrações para a administração da plataforma.
-- Expõe somente contagens e datas; nunca credenciais, mensagens ou payloads de clientes.

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_integration_overview()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  status text,
  issue_count integer,
  failed_charge_jobs integer,
  failed_messages integer,
  connection_errors integer,
  open_incidents integer,
  unassigned_incidents integer,
  last_failure_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT organization.id,
         COALESCE(NULLIF(organization.trade_name, ''), organization.legal_name)::text,
         CASE
           WHEN health.connection_errors > 0 OR health.unassigned_incidents > 0 THEN 'critical'
           WHEN health.issue_count > 0 THEN 'attention'
           ELSE 'healthy'
         END::text,
         health.issue_count,
         health.failed_charge_jobs,
         health.failed_messages,
         health.connection_errors,
         health.open_incidents,
         health.unassigned_incidents,
         health.last_failure_at
    FROM public.organizations organization
    CROSS JOIN LATERAL (
      SELECT
        (charge.failed_count + message.failed_count + connection.error_count
          + incident.open_count)::integer AS issue_count,
        charge.failed_count::integer AS failed_charge_jobs,
        message.failed_count::integer AS failed_messages,
        connection.error_count::integer AS connection_errors,
        incident.open_count::integer AS open_incidents,
        incident.unassigned_count::integer AS unassigned_incidents,
        GREATEST(
          charge.last_failure_at,
          message.last_failure_at,
          connection.last_failure_at,
          incident.last_failure_at
        ) AS last_failure_at
      FROM (
        SELECT count(*) FILTER (WHERE job.status = 'failed') AS failed_count,
               max(job.updated_at) FILTER (WHERE job.status = 'failed') AS last_failure_at
          FROM public.asaas_charge_jobs job
         WHERE job.organization_id = organization.id
      ) charge
      CROSS JOIN (
        SELECT count(*) FILTER (WHERE message.status = 'failed') AS failed_count,
               max(message.occurred_at) FILTER (WHERE message.status = 'failed') AS last_failure_at
          FROM public.communication_channel_messages message
         WHERE message.organization_id = organization.id
      ) message
      CROSS JOIN (
        SELECT count(*) FILTER (
                 WHERE connection.status = 'error' OR connection.last_error_code IS NOT NULL
               ) AS error_count,
               max(connection.updated_at) FILTER (
                 WHERE connection.status = 'error' OR connection.last_error_code IS NOT NULL
               ) AS last_failure_at
          FROM public.communication_channel_connections connection
         WHERE connection.organization_id = organization.id
      ) connection
      CROSS JOIN (
        SELECT count(*) FILTER (WHERE incident.status = 'in_progress') AS open_count,
               count(*) FILTER (
                 WHERE incident.status = 'in_progress' AND incident.assigned_to IS NULL
               ) AS unassigned_count,
               max(incident.updated_at) FILTER (
                 WHERE incident.status = 'in_progress'
               ) AS last_failure_at
          FROM public.integration_incidents incident
         WHERE incident.organization_id = organization.id
      ) incident
    ) health
   WHERE organization.archived_at IS NULL
   ORDER BY
     CASE
       WHEN health.connection_errors > 0 OR health.unassigned_incidents > 0 THEN 0
       WHEN health.issue_count > 0 THEN 1
       ELSE 2
     END,
     health.last_failure_at DESC NULLS LAST,
     organization.legal_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_integration_overview()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.platform_integration_overview()
  TO authenticated;

COMMIT;
