-- FLUXA: consulta móvel somente leitura. Requer fundação, atividade, propostas,
-- contratos, catálogo, atendimentos, retornos e preferências já ativados.
BEGIN;
CREATE OR REPLACE FUNCTION public.real_estate_mobile(_organization_id uuid,_action text,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; person jsonb; client uuid; term text; page integer; start_at timestamptz; end_at timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT public.real_estate_enabled(_organization_id) THEN
  RAISE EXCEPTION 'MOBILE_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'MOBILE_INVALID' USING ERRCODE='22023'; END IF;
 page:=coalesce((_values->>'page')::integer,1);
 IF page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'MOBILE_INVALID' USING ERRCODE='22023'; END IF;
 IF _action='search' THEN
  term:=btrim(coalesce(_values->>'search',''));
  IF length(term) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'MOBILE_INVALID' USING ERRCODE='22023'; END IF;
  WITH matches AS (
   SELECT c.id,c.name,c.city,c.state,c.status FROM public.clients_secure c
   WHERE c.organization_id=_organization_id AND c.archived_at IS NULL
   AND strpos(translate(lower(c.name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),translate(lower(term),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))>0
  ), rows AS (SELECT * FROM matches ORDER BY name,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name,r.id) FROM rows r),'[]'::jsonb),'total',(SELECT count(*) FROM matches)) INTO result;
 ELSIF _action='properties' THEN
  term:=left(btrim(coalesce(_values->>'search','')),100);
  WITH matches AS (
   SELECT p.id,p.code,p.title,p.property_type,p.purpose,p.status,p.district,p.city,p.state,p.sale_price,p.rent_price
   FROM public.real_estate_properties p WHERE p.organization_id=_organization_id
   AND (term='' OR strpos(lower(concat_ws(' ',p.code,p.title,p.district,p.city)),lower(term))>0)
  ), rows AS (SELECT * FROM matches ORDER BY code,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.code,r.id) FROM rows r),'[]'::jsonb),'total',(SELECT count(*) FROM matches)) INTO result;
 ELSIF _action='client' THEN
  client:=(_values->>'client')::uuid;
  SELECT jsonb_build_object('id',c.id,'name',c.name,'city',c.city,'state',c.state,'status',c.status,'phone',c.phone,'whatsapp',c.whatsapp,'email',c.email,'owner_name',c.owner_name) INTO person
  FROM public.clients_secure c WHERE c.organization_id=_organization_id AND c.id=client;
  IF person IS NULL THEN RAISE EXCEPTION 'MOBILE_READ_DENIED' USING ERRCODE='42501'; END IF;
  WITH entries AS (
   SELECT i.id::text AS id,'interest'::text AS kind,p.code||' · '||p.title AS title,concat_ws(' · ',p.district,p.city,p.state) AS location,i.status,i.purpose,
    CASE WHEN i.purpose='locacao' THEN p.rent_price ELSE p.sale_price END AS amount,i.updated_at AS at,NULL::text AS detail
   FROM public.real_estate_interests i JOIN public.real_estate_properties p ON p.organization_id=i.organization_id AND p.id=i.property_id
   WHERE i.organization_id=_organization_id AND i.client_id=client
   UNION ALL
   SELECT v.id::text,'visit',p.code||' · '||p.title,concat_ws(' · ',p.district,p.city,p.state),v.status,i.purpose,NULL,v.starts_at,NULL
   FROM public.real_estate_visits v JOIN public.real_estate_interests i ON i.organization_id=v.organization_id AND i.property_id=v.property_id AND i.id=v.interest_id JOIN public.real_estate_properties p ON p.organization_id=v.organization_id AND p.id=v.property_id
   WHERE v.organization_id=_organization_id AND i.client_id=client
   UNION ALL
   SELECT r.id::text,'proposal',p.code||' · '||p.title,concat_ws(' · ',p.district,p.city,p.state),e.status,i.purpose,e.amount,e.created_at,NULL
   FROM public.real_estate_proposals r JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.id=r.interest_id JOIN public.real_estate_properties p ON p.organization_id=r.organization_id AND p.id=r.property_id
   CROSS JOIN LATERAL(SELECT e.status,e.amount,e.created_at FROM public.real_estate_proposal_events e WHERE e.organization_id=r.organization_id AND e.property_id=r.property_id AND e.proposal_id=r.id ORDER BY e.version DESC LIMIT 1)e
   WHERE r.organization_id=_organization_id AND i.client_id=client
   UNION ALL
   SELECT c.id::text,'contract',c.reference||' · '||p.title,concat_ws(' · ',p.district,p.city,p.state),e.status,c.purpose,e.amount,e.created_at,e.starts_on::text||coalesce(' — '||e.ends_on::text,'')
   FROM public.real_estate_contracts c JOIN public.real_estate_properties p ON p.organization_id=c.organization_id AND p.id=c.property_id
   CROSS JOIN LATERAL(SELECT e.status,e.amount,e.created_at,e.starts_on,e.ends_on FROM public.real_estate_contract_events e WHERE e.organization_id=c.organization_id AND e.property_id=c.property_id AND e.contract_id=c.id ORDER BY e.version DESC LIMIT 1)e
   WHERE c.organization_id=_organization_id AND c.client_id=client
   UNION ALL
   SELECT r.id::text,'preference',coalesce(nullif(pref.property_type,''),'—'),array_to_string(pref.districts,', '),r.status,pref.purpose,pref.max_price,r.updated_at,NULL
   FROM fluxa_inquiry_private.requests r JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.id=r.interest_id AND i.property_id=r.property_id JOIN fluxa_inquiry_private.preferences pref ON pref.organization_id=r.organization_id AND pref.request_id=r.id
   WHERE r.organization_id=_organization_id AND i.client_id=client
   UNION ALL
   SELECT r.id::text,'return',r.name,NULL,r.status,r.purpose,NULL,f.next_contact_at,NULL
   FROM fluxa_inquiry_private.requests r JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.id=r.interest_id AND i.property_id=r.property_id JOIN fluxa_inquiry_private.followups f ON f.organization_id=r.organization_id AND f.request_id=r.id
   WHERE r.organization_id=_organization_id AND i.client_id=client AND r.status<>'encerrado' AND f.next_contact_at IS NOT NULL
  ), rows AS (SELECT * FROM entries ORDER BY at DESC,id,kind LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('client',person,'items',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.at DESC,r.id,r.kind) FROM rows r),'[]'::jsonb),'total',(SELECT count(*) FROM entries)) INTO result;
 ELSIF _action='today' THEN
  start_at:=(_values->>'start')::timestamptz;end_at:=(_values->>'end')::timestamptz;
  IF start_at IS NULL OR end_at IS NULL OR NOT isfinite(start_at) OR NOT isfinite(end_at) OR end_at-start_at NOT BETWEEN interval '22 hours' AND interval '26 hours' THEN RAISE EXCEPTION 'MOBILE_INVALID' USING ERRCODE='22023'; END IF;
  WITH entries AS (
   SELECT v.id::text AS id,'visit'::text AS kind,c.id AS client_id,c.name||' · '||p.code AS title,v.starts_at AS at
   FROM public.real_estate_visits v JOIN public.real_estate_interests i ON i.organization_id=v.organization_id AND i.property_id=v.property_id AND i.id=v.interest_id JOIN public.clients_secure c ON c.organization_id=i.organization_id AND c.id=i.client_id JOIN public.real_estate_properties p ON p.organization_id=v.organization_id AND p.id=v.property_id
   WHERE v.organization_id=_organization_id AND v.responsible_user_id=auth.uid() AND v.status='agendada' AND v.starts_at>=start_at AND v.starts_at<end_at
   UNION ALL
   SELECT r.id::text,'return',c.id,r.name,f.next_contact_at FROM fluxa_inquiry_private.requests r JOIN fluxa_inquiry_private.followups f ON f.organization_id=r.organization_id AND f.request_id=r.id
   LEFT JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.id=r.interest_id
   LEFT JOIN public.clients_secure c ON c.organization_id=i.organization_id AND c.id=i.client_id
   WHERE r.organization_id=_organization_id AND r.responsible_user_id=auth.uid() AND r.status<>'encerrado' AND f.next_contact_at>=start_at AND f.next_contact_at<end_at AND (r.interest_id IS NULL OR c.id IS NOT NULL)
  ), rows AS (SELECT * FROM entries ORDER BY at,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.at,r.id) FROM rows r),'[]'::jsonb),'total',(SELECT count(*) FROM entries)) INTO result;
 ELSE RAISE EXCEPTION 'MOBILE_INVALID' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.real_estate_mobile(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_mobile(uuid,text,jsonb) TO authenticated;
COMMIT;
