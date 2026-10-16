-- Visão geral imobiliária. Aplicar após foundation, activity, proposals, contracts e settlements.
-- Consulta somente leitura; mantém RLS e não altera registros de clientes.
BEGIN;
CREATE OR REPLACE FUNCTION public.real_estate_overview(
  _organization_id uuid, _search text DEFAULT NULL, _kind text DEFAULT NULL,
  _scope text DEFAULT 'pendencias', _page integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.real_estate_enabled(_organization_id) THEN
    RAISE EXCEPTION 'REAL_ESTATE_READ_DENIED' USING ERRCODE='42501';
  END IF;
  IF _page IS NULL OR _page<1 OR _page>100000 OR length(coalesce(_search,''))>120
    OR _scope IS NULL OR _scope NOT IN ('pendencias','todos')
    OR (_kind IS NOT NULL AND _kind NOT IN ('imovel','proposta','contrato','repasse')) THEN
    RAISE EXCEPTION 'REAL_ESTATE_INVALID' USING ERRCODE='22023';
  END IF;
  WITH properties AS MATERIALIZED (
    SELECT p.*,c.name AS owner_name,pr.full_name AS responsible_name
    FROM public.real_estate_properties p
    LEFT JOIN public.clients c ON c.organization_id=p.organization_id AND c.id=p.owner_client_id
    LEFT JOIN public.profiles pr ON pr.id=p.responsible_user_id
    WHERE p.organization_id=_organization_id
  ), proposals AS (
    SELECT r.id,'proposta'::text AS kind,to_jsonb(p) AS property,
      to_jsonb(e)||jsonb_build_object('id',r.id,'interest_id',r.interest_id,'purpose',i.purpose,
        'client_name',c.name,'updated_at',e.created_at,'display_status',
        CASE WHEN e.status IN ('aberta','contraproposta') AND e.valid_until<today THEN 'vencida' ELSE e.status END) AS data,
      e.status IN ('aberta','contraproposta') AS pending,e.valid_until AS due_on,e.created_at AS updated_at,
      concat_ws(' ',p.code,p.title,p.owner_name,c.name) AS search_text
    FROM public.real_estate_proposals r JOIN properties p ON p.id=r.property_id
    JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.id=r.interest_id
    LEFT JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id
    CROSS JOIN LATERAL(SELECT * FROM public.real_estate_proposal_events e WHERE e.organization_id=r.organization_id AND e.property_id=r.property_id AND e.proposal_id=r.id ORDER BY version DESC LIMIT 1) e
    WHERE r.organization_id=_organization_id
  ), contracts AS (
    SELECT ct.id,'contrato'::text AS kind,to_jsonb(p) AS property,
      to_jsonb(e)||jsonb_build_object('id',ct.id,'proposal_id',ct.proposal_id,'reference',ct.reference,
        'purpose',ct.purpose,'client_name',c.name,'property_code',p.code,'property_title',p.title,
        'updated_at',e.created_at,'display_status',CASE WHEN e.status<>'ativo' THEN e.status
          WHEN e.starts_on>today THEN 'futuro' WHEN e.ends_on<today THEN 'vencido'
          WHEN e.ends_on<=today+30 THEN 'a_vencer' ELSE 'ativo' END) AS data,
      (e.status='ativo' AND e.starts_on<=today AND e.ends_on<=today+30) AS pending,
      e.ends_on AS due_on,e.created_at AS updated_at,
      concat_ws(' ',p.code,p.title,p.owner_name,c.name,ct.reference) AS search_text
    FROM public.real_estate_contracts ct JOIN properties p ON p.id=ct.property_id
    LEFT JOIN public.clients c ON c.organization_id=ct.organization_id AND c.id=ct.client_id
    CROSS JOIN LATERAL(SELECT * FROM public.real_estate_contract_events e WHERE e.organization_id=ct.organization_id AND e.property_id=ct.property_id AND e.contract_id=ct.id ORDER BY version DESC LIMIT 1) e
    WHERE ct.organization_id=_organization_id
  ), settlements AS (
    SELECT s.id,'repasse'::text AS kind,to_jsonb(p) AS property,
      to_jsonb(s)||jsonb_build_object('owner_amount',s.gross-s.commission_amount,'contract_reference',ct.reference,
        'property_code',p.code,'owner_name',c.name,'version',e.version,'status',e.status,
        'occurred_on',e.occurred_on,'note',e.note,'updated_at',e.created_at,'display_status',
        CASE WHEN e.status='recebido' AND s.due_on<today THEN 'atrasado' ELSE e.status END) AS data,
      (e.status='recebido' AND s.due_on<today) AS pending,s.due_on,e.created_at AS updated_at,
      concat_ws(' ',p.code,p.title,c.name,ct.reference,s.reference) AS search_text
    FROM public.real_estate_settlements s JOIN properties p ON p.id=s.property_id
    JOIN public.real_estate_contracts ct ON ct.organization_id=s.organization_id AND ct.property_id=s.property_id AND ct.id=s.contract_id
    LEFT JOIN public.clients c ON c.organization_id=s.organization_id AND c.id=s.owner_client_id
    CROSS JOIN LATERAL(SELECT * FROM public.real_estate_settlement_events e WHERE e.organization_id=s.organization_id AND e.property_id=s.property_id AND e.settlement_id=s.id ORDER BY version DESC LIMIT 1) e
    WHERE s.organization_id=_organization_id AND public.real_estate_settlement_access(_organization_id)
  ), records AS MATERIALIZED (
    SELECT * FROM proposals UNION ALL SELECT * FROM contracts UNION ALL SELECT * FROM settlements
    UNION ALL SELECT p.id,'imovel',to_jsonb(p),to_jsonb(p),false,NULL::date,p.updated_at,
      concat_ws(' ',p.code,p.title,p.owner_name,p.city,p.street) FROM properties p
  ), filtered AS (
    SELECT * FROM records WHERE (_kind IS NULL OR kind=_kind)
      AND (_scope='todos' OR pending)
      AND (coalesce(btrim(_search),'')='' OR strpos(lower(search_text),lower(btrim(_search)))>0)
  ), paged AS (
    SELECT * FROM filtered ORDER BY due_on ASC NULLS LAST,updated_at DESC,kind,id LIMIT 20 OFFSET (_page-1)*20
  )
  SELECT jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'property',property,'data',data,'due_on',due_on)
      ORDER BY due_on ASC NULLS LAST,updated_at DESC,kind,id) FROM paged),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),
    'counts',jsonb_build_object('proposta',(SELECT count(*) FROM records WHERE kind='proposta' AND pending),
      'contrato',(SELECT count(*) FROM records WHERE kind='contrato' AND pending),
      'repasse',(SELECT count(*) FROM records WHERE kind='repasse' AND pending))
  ) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.real_estate_overview(uuid,text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_overview(uuid,text,text,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
