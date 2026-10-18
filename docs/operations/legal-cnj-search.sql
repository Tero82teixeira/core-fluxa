BEGIN;
CREATE INDEX IF NOT EXISTS legal_case_profiles_org_cnj_idx
  ON public.legal_case_profiles(organization_id,cnj_number text_pattern_ops)
  WHERE cnj_number IS NOT NULL;
-- Somente leitura; preserva os papéis das consultas jurídicas privadas.
CREATE OR REPLACE FUNCTION public.search_legal_processes(
  _organization_id uuid,
  _cnj text,
  _filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  result jsonb;
  requested_page integer;
  page_size integer;
  archived boolean;
  ordering text := COALESCE(_filters->>'sort','due');
  deadline_filter text := COALESCE(_filters->>'deadline','todos');
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(_organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','visualizador']::public.app_role[])
    OR NOT public.legal_module_enabled(_organization_id) THEN
    RAISE EXCEPTION 'LEGAL_SEARCH_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  requested_page := COALESCE((_filters->>'page')::integer,0);
  page_size := COALESCE((_filters->>'pageSize')::integer,25);
  archived := COALESCE((_filters->>'archived')::boolean,false);
  IF _cnj IS NULL OR _cnj !~ '^[0-9]{7,20}$'
    OR jsonb_typeof(_filters) IS DISTINCT FROM 'object'
    OR requested_page<0 OR requested_page>1000000 OR page_size<1 OR page_size>50
    OR ordering NOT IN ('due','recent','code')
    OR deadline_filter NOT IN ('todos','atrasados','hoje','semana','sem_prazo') THEN
    RAISE EXCEPTION 'LEGAL_SEARCH_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  WITH matches AS MATERIALIZED (
    SELECT p.*, profile.cnj_number,
      jsonb_build_object('id',c.id,'name',c.name,'status',c.status) AS clients,
      CASE WHEN service.id IS NULL THEN NULL ELSE jsonb_build_object('id',service.id,'name',service.name) END AS service_types
    FROM public.legal_case_profiles profile
    JOIN public.processes p ON p.id=profile.process_id AND p.organization_id=profile.organization_id
    JOIN public.clients c ON c.id=p.client_id AND c.organization_id=p.organization_id
    LEFT JOIN public.service_types service ON service.id=p.service_type_id AND service.organization_id=p.organization_id
    WHERE profile.organization_id=_organization_id AND profile.cnj_number LIKE _cnj||'%'
      AND ((archived AND p.archived_at IS NOT NULL) OR (NOT archived AND p.archived_at IS NULL))
      AND (COALESCE(_filters->>'clientId','todos')='todos' OR p.client_id::text=_filters->>'clientId')
      AND (COALESCE(_filters->>'serviceTypeId','todos')='todos' OR p.service_type_id::text=_filters->>'serviceTypeId')
      AND (COALESCE(_filters->>'stage','todos')='todos' OR p.stage::text=_filters->>'stage')
      AND (COALESCE(_filters->>'priority','todos')='todos' OR p.priority::text=_filters->>'priority')
      AND (COALESCE(_filters->>'owner','todos')='todos' OR p.owner_name=_filters->>'owner')
      AND (COALESCE(_filters->>'financial','todos')='todos' OR p.financial_status::text=_filters->>'financial')
      AND (deadline_filter='todos' OR
        (deadline_filter='atrasados' AND p.due_date<today) OR
        (deadline_filter='hoje' AND p.due_date=today) OR
        (deadline_filter='semana' AND p.due_date>=today AND p.due_date<=today+7) OR
        (deadline_filter='sem_prazo' AND p.due_date IS NULL))
  ), ordered AS (
    SELECT m.*,row_number() OVER (ORDER BY
      CASE WHEN ordering='due' THEN m.due_date END ASC NULLS LAST,
      CASE WHEN ordering='recent' THEN m.last_movement_at END DESC NULLS LAST,
      CASE WHEN ordering='code' THEN m.code END DESC,
      m.id
    ) AS position FROM matches m
  )
  SELECT jsonb_build_object('total',(SELECT count(*) FROM matches),'items',COALESCE((
    SELECT jsonb_agg(to_jsonb(x)-'position' ORDER BY x.position)
    FROM (SELECT * FROM ordered ORDER BY position LIMIT page_size OFFSET requested_page*page_size) x
  ),'[]'::jsonb)) INTO result;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.search_legal_processes(uuid,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.search_legal_processes(uuid,text,jsonb) TO authenticated;
COMMIT;
