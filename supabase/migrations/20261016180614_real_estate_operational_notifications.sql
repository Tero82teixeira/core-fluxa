-- FLUXA Imobiliária: aplicar no mesmo banco operacional do painel imobiliário.
-- Reutiliza o job de 15 minutos; não cria cron nem altera registros imobiliários.
BEGIN;
CREATE SCHEMA IF NOT EXISTS fluxa_real_estate_private;
REVOKE ALL ON SCHEMA fluxa_real_estate_private FROM PUBLIC, anon, authenticated, service_role;

-- O próprio postgres do scheduler executa a leitura e a gravação dos avisos.
-- Não eleva privilégios e não pode ser chamada pela API dos usuários.
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.create_operational_notifications(
  _as_of timestamptz DEFAULT now()
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  created_count integer;
  today date := (_as_of AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF _as_of IS NULL THEN RAISE EXCEPTION 'REAL_ESTATE_ALERT_DATE_REQUIRED'; END IF;
  -- As tabelas imobiliárias são opcionais em instalações de outros segmentos.
  IF to_regclass('public.real_estate_properties') IS NULL
    OR to_regclass('public.real_estate_proposals') IS NULL
    OR to_regclass('public.real_estate_proposal_events') IS NULL
    OR to_regclass('public.real_estate_contracts') IS NULL
    OR to_regclass('public.real_estate_contract_events') IS NULL
    OR to_regclass('public.real_estate_settlements') IS NULL
    OR to_regclass('public.real_estate_settlement_events') IS NULL THEN
    RETURN 0;
  END IF;

  WITH properties AS MATERIALIZED (
    SELECT p.* FROM public.real_estate_properties p
    JOIN public.organizations org ON org.id = p.organization_id AND org.archived_at IS NULL
    JOIN public.organization_settings settings ON settings.organization_id = org.id
    WHERE settings.business_segment = 'real_estate'
      AND (settings.enabled_modules IS NULL OR settings.enabled_modules = '[]'::jsonb
        OR settings.enabled_modules ? 'real_estate_workspace')
  ), candidates AS (
    SELECT p.organization_id, r.id AS entity_id, 'real_estate_proposal'::text AS entity_type,
      'proposta'::text AS kind, p.code,
      CASE WHEN e.valid_until < today THEN 'Proposta vencida aguardando decisão'
        ELSE 'Proposta aguardando decisão' END AS title,
      format('%s · %s · validade %s.',p.code,left(p.title,120),to_char(e.valid_until,'DD/MM/YYYY')) AS body,
      'real-estate-proposal:' || r.id || ':' || e.version || ':' ||
        CASE WHEN e.valid_until < today THEN 'vencida' ELSE 'pendente' END AS dedupe_base,
      ARRAY['superadmin','proprietario','administrador','gestor','operacional']::text[] AS roles
    FROM public.real_estate_proposals r
    JOIN properties p ON p.organization_id = r.organization_id AND p.id = r.property_id
    CROSS JOIN LATERAL (
      SELECT e.* FROM public.real_estate_proposal_events e
      WHERE e.organization_id = r.organization_id AND e.property_id = r.property_id AND e.proposal_id = r.id
      ORDER BY e.version DESC LIMIT 1
    ) e
    WHERE e.status IN ('aberta','contraproposta')

    UNION ALL

    SELECT p.organization_id, ct.id, 'real_estate_contract', 'contrato', p.code,
      CASE WHEN e.ends_on < today THEN 'Contrato vencido'
        WHEN e.ends_on = today THEN 'Contrato vence hoje'
        WHEN e.ends_on = today + 1 THEN 'Contrato vence amanhã'
        ELSE 'Contrato próximo do vencimento' END,
      format('%s · %s · término %s.',p.code,left(ct.reference,120),to_char(e.ends_on,'DD/MM/YYYY')),
      'real-estate-contract:' || ct.id || ':' || e.ends_on || ':' ||
        CASE WHEN e.ends_on < today THEN 'vencido' WHEN e.ends_on = today THEN '0'
          WHEN e.ends_on <= today+1 THEN '1' WHEN e.ends_on <= today+7 THEN '7'
          WHEN e.ends_on <= today+15 THEN '15' ELSE '30' END,
      ARRAY['superadmin','proprietario','administrador','gestor','operacional']::text[]
    FROM public.real_estate_contracts ct
    JOIN properties p ON p.organization_id = ct.organization_id AND p.id = ct.property_id
    CROSS JOIN LATERAL (
      SELECT e.* FROM public.real_estate_contract_events e
      WHERE e.organization_id = ct.organization_id AND e.property_id = ct.property_id AND e.contract_id = ct.id
      ORDER BY e.version DESC LIMIT 1
    ) e
    WHERE e.status = 'ativo' AND e.starts_on <= today AND e.ends_on <= today+30

    UNION ALL

    SELECT p.organization_id, s.id, 'real_estate_settlement', 'repasse', p.code,
      'Repasse atrasado',
      format('%s · %s · competência %s · previsão %s.',p.code,left(ct.reference,120),s.reference,to_char(s.due_on,'DD/MM/YYYY')),
      'real-estate-settlement:' || s.id || ':' || s.due_on || ':atrasado',
      ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::text[]
    FROM public.real_estate_settlements s
    JOIN properties p ON p.organization_id = s.organization_id AND p.id = s.property_id
    JOIN public.real_estate_contracts ct
      ON ct.organization_id = s.organization_id AND ct.property_id = s.property_id AND ct.id = s.contract_id
    CROSS JOIN LATERAL (
      SELECT e.* FROM public.real_estate_settlement_events e
      WHERE e.organization_id = s.organization_id AND e.property_id = s.property_id AND e.settlement_id = s.id
      ORDER BY e.version DESC LIMIT 1
    ) e
    WHERE e.status = 'recebido' AND s.due_on < today
  )
  INSERT INTO public.notifications(organization_id,user_id,kind,title,body,entity_type,entity_id,action_url,dedupe_key)
  SELECT c.organization_id,m.user_id,'real_estate',left(c.title,160),left(c.body,500),c.entity_type,c.entity_id,
    '/imobiliaria/imoveis?pendencia=' || c.kind || '&busca=' || c.code,
    c.dedupe_base || ':' || m.user_id
  FROM candidates c
  JOIN public.organization_members m ON m.organization_id = c.organization_id
    AND m.is_active AND m.role::text = ANY(c.roles)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$$;

-- Mantém a definição vigente do ciclo (incluindo Saúde, Jurídico e Asaas).
-- O wrapper é privado e será executado pelo mesmo job já existente.
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.run_temporal_with_real_estate()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; alert_count integer := 0;
BEGIN
  result := public.run_temporal_automation_cycle();
  BEGIN
    alert_count := fluxa_real_estate_private.create_operational_notifications();
  EXCEPTION WHEN OTHERS THEN
    alert_count := -1;
    RAISE WARNING 'REAL_ESTATE_OPERATIONAL_ALERT_SCAN_FAILED: %', SQLSTATE;
  END;
  RETURN result || jsonb_build_object('real_estate_operational_notifications_created',alert_count);
END;
$$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.create_operational_notifications(timestamptz),
  fluxa_real_estate_private.run_temporal_with_real_estate() FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA fluxa_real_estate_private TO postgres;
GRANT EXECUTE ON FUNCTION fluxa_real_estate_private.create_operational_notifications(timestamptz),
  fluxa_real_estate_private.run_temporal_with_real_estate() TO postgres;

DO $scheduler$
DECLARE existing_job record;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'SCHEDULER_REQUIRES_POSTGRES'; END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'core-fluxa-process-due-scheduled-automations') <> 1 THEN
    RAISE EXCEPTION 'TEMPORAL_CLOCK_NOT_FOUND_OR_DUPLICATED';
  END IF;
  SELECT * INTO STRICT existing_job FROM cron.job WHERE jobname = 'core-fluxa-process-due-scheduled-automations';
  IF existing_job.username <> 'postgres' OR NOT existing_job.active
    OR btrim(existing_job.command) NOT IN (
      'SELECT public.run_temporal_automation_cycle();',
      'SELECT fluxa_real_estate_private.run_temporal_with_real_estate();'
    ) THEN RAISE EXCEPTION 'TEMPORAL_CLOCK_CONFIGURATION_UNEXPECTED'; END IF;
  PERFORM cron.alter_job(existing_job.jobid,
    command := 'SELECT fluxa_real_estate_private.run_temporal_with_real_estate();');
END;
$scheduler$;
COMMIT;
