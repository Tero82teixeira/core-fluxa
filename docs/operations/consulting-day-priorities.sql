-- Read-only priorities for Consulting. Plans remain private; the existing access
-- helper enforces active organization membership, segment, role and modules.
BEGIN;
CREATE OR REPLACE FUNCTION public.read_consulting_day(
  _organization_id uuid, _kind text DEFAULT 'delivery', _page integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.consulting_plan_access(_organization_id,false,false) THEN
    RAISE EXCEPTION 'CONSULTING_DAY_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _kind IS NULL OR _kind NOT IN ('delivery','followup','project') OR _page IS NULL OR _page<0 OR _page>1000000 THEN
    RAISE EXCEPTION 'CONSULTING_DAY_FILTER_INVALID' USING ERRCODE='22023';
  END IF;
  WITH projects AS (
    SELECT p.id,p.organization_id,p.code,coalesce(nullif(trim(p.title),''),p.code) AS project_title,p.due_date,c.name AS client_name
    FROM public.processes p
    JOIN public.clients c ON c.id=p.client_id AND c.organization_id=p.organization_id AND c.archived_at IS NULL
    WHERE p.organization_id=_organization_id AND p.archived_at IS NULL
      AND p.stage NOT IN ('finalizado','arquivado','cancelado')
  ), priorities AS (
    SELECT 'delivery'::text AS kind,d.id,p.id AS process_id,p.code,p.project_title,p.client_name,d.title,d.due_date
    FROM projects p JOIN public.process_checklist_items d ON d.process_id=p.id AND d.organization_id=p.organization_id
    WHERE d.deleted_at IS NULL AND d.status<>'aprovado' AND d.due_date<today
    UNION ALL
    SELECT 'followup',p.id,p.id,p.code,p.project_title,p.client_name,plan.service_name,plan.return_on
    FROM projects p JOIN public.consulting_monthly_plans plan ON plan.process_id=p.id AND plan.organization_id=p.organization_id
    WHERE plan.status='ativo' AND plan.return_on<=today+7
    UNION ALL
    SELECT 'project',p.id,p.id,p.code,p.project_title,p.client_name,p.project_title,p.due_date
    FROM projects p WHERE p.due_date<=today+7
  ), page AS (
    SELECT * FROM priorities WHERE kind=_kind ORDER BY due_date,id LIMIT 6 OFFSET _page*6
  )
  SELECT jsonb_build_object(
    'today',today,'horizon',today+7,'kind',_kind,'page',_page,
    'counts',jsonb_build_object(
      'delivery',(SELECT count(*) FROM priorities WHERE kind='delivery'),
      'followup',(SELECT count(*) FROM priorities WHERE kind='followup'),
      'project',(SELECT count(*) FROM priorities WHERE kind='project')),
    'total',(SELECT count(*) FROM priorities WHERE kind=_kind),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY due_date,id) FROM page),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.read_consulting_day(uuid,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_consulting_day(uuid,text,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
