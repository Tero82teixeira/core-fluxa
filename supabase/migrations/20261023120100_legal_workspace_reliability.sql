BEGIN;
DO $check$
BEGIN
  IF to_regprocedure('public.legal_module_enabled(uuid)') IS NULL
    OR to_regclass('public.legal_case_profiles') IS NULL
    OR to_regclass('public.legal_deadlines') IS NULL THEN
    RAISE EXCEPTION 'Aplique primeiro a base jurídica, as fichas e os prazos do FLUXA.';
  END IF;
END;
$check$;
-- Totais completos e agenda paginada do FLUXA Advocacia.
-- Mantém os mesmos papéis e escopo organizacional das RPCs jurídicas existentes.
CREATE OR REPLACE FUNCTION public.read_legal_workspace(
  _organization_id uuid,
  _action text,
  _values jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
  day_start date;
  day_end date;
  instant_start timestamptz;
  instant_end timestamptz;
  page_number integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','visualizador']::public.app_role[]
  ) OR NOT public.legal_module_enabled(_organization_id) THEN
    RAISE EXCEPTION 'LEGAL_WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _action IS NULL OR _action NOT IN ('dashboard','agenda')
    OR jsonb_typeof(_values) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'LEGAL_WORKSPACE_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  day_start := (_values->>'date')::date;
  IF day_start IS NULL OR NOT isfinite(day_start) OR day_start < DATE '1999-12-27'
    OR day_start > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'LEGAL_WORKSPACE_DATE_INVALID' USING ERRCODE='22023';
  END IF;
  IF _action = 'dashboard' THEN
    -- Agrupa toda a carteira; só as listas de prévia são limitadas, nunca os totais.
    WITH active AS MATERIALIZED (
      SELECT p.id,p.code,p.title,p.stage,p.owner_name,p.due_date,c.name AS client_name
      FROM public.processes p
      JOIN public.clients c ON c.id=p.client_id AND c.organization_id=p.organization_id
      WHERE p.organization_id=_organization_id AND p.archived_at IS NULL
        AND c.archived_at IS NULL AND p.stage NOT IN ('finalizado','arquivado','cancelado')
    ), due AS MATERIALIZED (
      SELECT 'general:'||p.id AS id,p.id AS process_id,p.code,p.title,p.stage,p.due_date,
        p.client_name,'general'::text AS source
      FROM active p WHERE p.due_date IS NOT NULL
      UNION ALL
      SELECT 'individual:'||d.id,p.id,p.code,d.title,p.stage,d.due_date,p.client_name,'individual'
      FROM public.legal_deadlines d JOIN active p ON p.id=d.process_id
      WHERE d.organization_id=_organization_id AND d.status='aberto'
    ), stages AS (
      SELECT stage AS key,count(*) AS count FROM active GROUP BY stage
    ), open_tasks AS (
      SELECT t.id,t.title,t.assignee_name,t.due_at
      FROM public.tasks t
      LEFT JOIN public.processes p ON p.id=t.process_id AND p.organization_id=t.organization_id
      LEFT JOIN public.clients c ON c.id=t.client_id AND c.organization_id=t.organization_id
      WHERE t.organization_id=_organization_id AND t.deleted_at IS NULL
        AND t.status IN ('pendente','em_andamento','aguardando')
        AND (t.process_id IS NULL OR (p.id IS NOT NULL AND p.archived_at IS NULL
          AND p.stage NOT IN ('finalizado','arquivado','cancelado')))
        AND (t.client_id IS NULL OR (c.id IS NOT NULL AND c.archived_at IS NULL))
    )
    SELECT jsonb_build_object(
      'counts',jsonb_build_object(
        'active',(SELECT count(*) FROM active),
        'overdue',(SELECT count(*) FROM due WHERE due_date<day_start),
        'today',(SELECT count(*) FROM due WHERE due_date=day_start),
        'nextSeven',(SELECT count(*) FROM due WHERE due_date>day_start AND due_date<=day_start+7),
        'requirement',(SELECT count(*) FROM active WHERE stage='exigencia'),
        'withoutOwner',(SELECT count(*) FROM active WHERE NULLIF(trim(owner_name),'') IS NULL)
      ),
      'urgentTotal',(SELECT count(*) FROM due WHERE due_date<=day_start+7),
      'urgentProcesses',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.due_date,x.id)
        FROM (SELECT * FROM due WHERE due_date<=day_start+7 ORDER BY due_date,id LIMIT 8) x),'[]'::jsonb),
      'taskTotal',(SELECT count(*) FROM open_tasks WHERE (due_at AT TIME ZONE 'America/Sao_Paulo')::date<=day_start+7),
      'urgentTasks',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.due_at,x.id)
        FROM (SELECT * FROM open_tasks WHERE (due_at AT TIME ZONE 'America/Sao_Paulo')::date<=day_start+7
          ORDER BY due_at,id LIMIT 6) x),'[]'::jsonb),
      'stageCounts',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.count DESC,s.key) FROM stages s),'[]'::jsonb)
    ) INTO result;
    RETURN result;
  END IF;
  day_end := (_values->>'endDate')::date;
  instant_start := (_values->>'from')::timestamptz;
  instant_end := (_values->>'to')::timestamptz;
  page_number := COALESCE((_values->>'page')::integer,1);
  IF day_end IS NULL OR NOT isfinite(day_end) OR day_end<=day_start OR day_end>day_start+7
    OR instant_start IS NULL OR instant_end IS NULL OR NOT isfinite(instant_start) OR NOT isfinite(instant_end)
    OR instant_end<=instant_start
    OR abs(extract(epoch FROM (instant_start-(day_start::timestamp AT TIME ZONE 'UTC')))) > 50400
    OR abs(extract(epoch FROM (instant_end-(day_end::timestamp AT TIME ZONE 'UTC')))) > 50400
    OR abs(extract(epoch FROM (instant_end-instant_start)) - (day_end-day_start)*86400) > 7200
    OR page_number<1 OR page_number>1000000 THEN
    RAISE EXCEPTION 'LEGAL_WORKSPACE_RANGE_INVALID' USING ERRCODE='22023';
  END IF;
  WITH active AS MATERIALIZED (
    SELECT p.id,p.code,p.title,p.due_date,c.name AS client_name,COALESCE(l.confidential,false) AS confidential,
      l.next_hearing_at,l.judicial_unit
    FROM public.processes p
    JOIN public.clients c ON c.id=p.client_id AND c.organization_id=p.organization_id
    LEFT JOIN public.legal_case_profiles l ON l.process_id=p.id AND l.organization_id=p.organization_id
    WHERE p.organization_id=_organization_id AND p.archived_at IS NULL AND c.archived_at IS NULL
      AND p.stage NOT IN ('finalizado','arquivado','cancelado')
  ), events AS MATERIALIZED (
    SELECT 'hearing:'||p.id AS id,'hearing'::text AS kind,p.next_hearing_at AS at,
      NULL::date AS civil_date,'Audiência · '||p.code AS title,
      p.client_name||COALESCE(' · '||p.judicial_unit,'') AS subtitle,p.id AS process_id,p.confidential
    FROM active p WHERE p.next_hearing_at>=instant_start AND p.next_hearing_at<instant_end
    UNION ALL
    SELECT 'general:'||p.id,'deadline',
      instant_start+(p.due_date-day_start)*interval '1 day',p.due_date,
      'Prazo geral · '||p.code,p.client_name||' · '||COALESCE(p.title,'Processo'),p.id,p.confidential
    FROM active p WHERE p.due_date>=day_start AND p.due_date<day_end
    UNION ALL
    SELECT 'individual:'||d.id,'deadline',
      instant_start+(d.due_date-day_start)*interval '1 day',d.due_date,
      d.title||' · '||p.code,p.client_name||' · '||COALESCE(p.title,'Processo'),p.id,p.confidential
    FROM public.legal_deadlines d JOIN active p ON p.id=d.process_id
    WHERE d.organization_id=_organization_id AND d.status='aberto' AND d.due_date>=day_start AND d.due_date<day_end
    UNION ALL
    SELECT 'task:'||t.id,'task',t.due_at,NULL::date,t.title,COALESCE(t.assignee_name,'Sem responsável'),t.process_id,
      COALESCE(l.confidential,false)
    FROM public.tasks t
    LEFT JOIN public.processes p ON p.id=t.process_id AND p.organization_id=t.organization_id
    LEFT JOIN public.clients c ON c.id=t.client_id AND c.organization_id=t.organization_id
    LEFT JOIN public.legal_case_profiles l ON l.process_id=p.id AND l.organization_id=p.organization_id
    WHERE t.organization_id=_organization_id AND t.deleted_at IS NULL
      AND t.status IN ('pendente','em_andamento','aguardando')
      AND (t.process_id IS NULL OR (p.id IS NOT NULL AND p.archived_at IS NULL
        AND p.stage NOT IN ('finalizado','arquivado','cancelado')))
      AND (t.client_id IS NULL OR (c.id IS NOT NULL AND c.archived_at IS NULL))
      AND t.due_at>=instant_start AND t.due_at<instant_end
  )
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM events),
    'counts',jsonb_build_object(
      'hearing',(SELECT count(*) FROM events WHERE kind='hearing'),
      'deadline',(SELECT count(*) FROM events WHERE kind='deadline'),
      'task',(SELECT count(*) FROM events WHERE kind='task')
    ),
    'items',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.at,x.id)
      FROM (SELECT * FROM events ORDER BY at,id LIMIT 20 OFFSET (page_number-1)*20) x),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.read_legal_workspace(uuid,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_legal_workspace(uuid,text,jsonb) TO authenticated;

COMMIT;
