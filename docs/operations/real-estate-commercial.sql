-- Painel comercial após atendimento manual. Somente leitura e funções como chamador.
BEGIN;
CREATE INDEX IF NOT EXISTS inquiry_org_created_idx ON fluxa_inquiry_private.requests(organization_id,created_at,id);
CREATE OR REPLACE FUNCTION fluxa_inquiry_private.commercial_scope(_org uuid,_values jsonb)
RETURNS SETOF fluxa_inquiry_private.requests LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE zone text; date_from date; date_to date; start_at timestamptz; end_at timestamptz; responsible text; v_origin text; metric text; reason text;
BEGIN
 IF auth.uid() IS NULL OR NOT fluxa_catalog_private.staff_access(_org) THEN RAISE EXCEPTION 'COMMERCIAL_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' OR coalesce(_values->>'date_from','') !~ '^\d{4}-\d{2}-\d{2}$' OR coalesce(_values->>'date_to','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'COMMERCIAL_INVALID' USING ERRCODE='22023'; END IF;
 zone:=coalesce(nullif(_values->>'timezone',''),'America/Sao_Paulo');
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'COMMERCIAL_INVALID' USING ERRCODE='22023'; END IF;
 date_from:=(_values->>'date_from')::date;date_to:=(_values->>'date_to')::date;
 IF NOT isfinite(date_from) OR NOT isfinite(date_to) OR date_to-date_from NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'COMMERCIAL_INVALID' USING ERRCODE='22023'; END IF;
 start_at:=date_from::timestamp AT TIME ZONE zone;end_at:=(date_to+1)::timestamp AT TIME ZONE zone;
 responsible:=coalesce(_values->>'responsible','');v_origin:=coalesce(_values->>'origin','');metric:=coalesce(nullif(_values->>'metric',''),'received');reason:=coalesce(_values->>'closure_reason','');
 IF v_origin NOT IN ('','vitrine','whatsapp','telefone','presencial','outro') OR metric NOT IN ('received','waiting','active','overdue','unassigned','won','closed') OR reason NOT IN ('','fechou_negocio','desistiu','sem_imovel','outro','legacy') THEN RAISE EXCEPTION 'COMMERCIAL_INVALID' USING ERRCODE='22023'; END IF;
 IF responsible NOT IN ('','unassigned') THEN PERFORM responsible::uuid; END IF;
 RETURN QUERY SELECT q.* FROM fluxa_inquiry_private.requests q LEFT JOIN fluxa_inquiry_private.followups f ON f.organization_id=q.organization_id AND f.request_id=q.id
 WHERE q.organization_id=_org AND q.created_at>=start_at AND q.created_at<end_at
 AND (responsible='' OR CASE WHEN responsible='unassigned' THEN q.responsible_user_id IS NULL ELSE q.responsible_user_id=nullif(responsible,'')::uuid END)
 AND (v_origin='' OR q.origin=v_origin)
 AND (reason='' OR (q.status='encerrado' AND CASE WHEN reason='legacy' THEN q.closure_reason IS NULL ELSE q.closure_reason=reason END))
 AND CASE metric WHEN 'received' THEN true WHEN 'waiting' THEN q.status='novo' WHEN 'active' THEN q.status<>'encerrado' WHEN 'closed' THEN q.status='encerrado' WHEN 'won' THEN q.status='encerrado' AND q.closure_reason='fechou_negocio' WHEN 'unassigned' THEN q.status<>'encerrado' AND q.responsible_user_id IS NULL WHEN 'overdue' THEN q.status<>'encerrado' AND f.next_contact_at<now() END;
END $$;
REVOKE ALL ON FUNCTION fluxa_inquiry_private.commercial_scope(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fluxa_inquiry_private.commercial_scope(uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.real_estate_commercial(_organization_id uuid,_action text,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; page integer; status_filter text; term text; mine boolean; follow_filter text; zone text;
BEGIN
 IF auth.uid() IS NULL OR NOT fluxa_catalog_private.staff_access(_organization_id) THEN RAISE EXCEPTION 'COMMERCIAL_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _action='summary' THEN
  WITH scope AS MATERIALIZED(SELECT q.*,f.next_contact_at FROM fluxa_inquiry_private.commercial_scope(_organization_id,_values||jsonb_build_object('metric','received','closure_reason','')) q LEFT JOIN fluxa_inquiry_private.followups f ON f.organization_id=q.organization_id AND f.request_id=q.id),
  grouped AS(SELECT origin,count(*) AS received,count(*) FILTER(WHERE status='novo') AS waiting,count(*) FILTER(WHERE status<>'encerrado') AS active,
   count(*) FILTER(WHERE status<>'encerrado' AND next_contact_at<now()) AS overdue,count(*) FILTER(WHERE status<>'encerrado' AND responsible_user_id IS NULL) AS unassigned,
   count(*) FILTER(WHERE status='encerrado' AND closure_reason='fechou_negocio') AS won,count(*) FILTER(WHERE status='encerrado') AS closed,
   count(*) FILTER(WHERE status='encerrado' AND closure_reason='fechou_negocio') AS fechou_negocio,count(*) FILTER(WHERE status='encerrado' AND closure_reason='desistiu') AS desistiu,
   count(*) FILTER(WHERE status='encerrado' AND closure_reason='sem_imovel') AS sem_imovel,count(*) FILTER(WHERE status='encerrado' AND closure_reason='outro') AS outro,count(*) FILTER(WHERE status='encerrado' AND closure_reason IS NULL) AS legacy
   FROM scope GROUP BY GROUPING SETS((origin),()))
  SELECT jsonb_build_object('totals',coalesce((SELECT to_jsonb(g)-'origin' FROM grouped g WHERE origin IS NULL),'{}'::jsonb),
   'channels',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY origin) FROM grouped g WHERE origin IS NOT NULL),'[]'::jsonb),
   'responsibles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',coalesce(nullif(p.full_name,''),'Usuário')) ORDER BY p.full_name,r.id)
    FROM (SELECT DISTINCT responsible_user_id AS id FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND responsible_user_id IS NOT NULL
    UNION SELECT m.user_id FROM public.organization_members m WHERE m.organization_id=_organization_id AND m.is_active AND m.role IN ('superadmin','proprietario','administrador','gestor','operacional')) r LEFT JOIN public.profiles p ON p.id=r.id),'[]'::jsonb),
   'as_of',now()) INTO result;RETURN result;
 ELSIF _action='queue' THEN
  page:=coalesce((_values->>'page')::integer,1);status_filter:=nullif(_values->>'status','');mine:=coalesce((_values->>'mine')::boolean,false);term:=left(btrim(coalesce(_values->>'search','')),120);follow_filter:=coalesce(_values->>'followup','');zone:=coalesce(nullif(_values->>'timezone',''),'America/Sao_Paulo');
  IF page NOT BETWEEN 1 AND 10000 OR follow_filter NOT IN ('','overdue','today','future','none') OR (status_filter IS NOT NULL AND status_filter NOT IN ('novo','em_contato','encerrado')) THEN RAISE EXCEPTION 'COMMERCIAL_INVALID' USING ERRCODE='22023'; END IF;
  WITH scope AS MATERIALIZED(SELECT * FROM fluxa_inquiry_private.commercial_scope(_organization_id,_values)),
  filtered AS MATERIALIZED(SELECT q.*,p.code AS property_code,p.title AS property_title,pr.full_name AS responsible_name,c.name AS client_name,
   CASE WHEN q.status<>'encerrado' THEN f.next_contact_at ELSE NULL END AS next_contact_at,
   (SELECT max(e.occurred_at) FROM fluxa_inquiry_private.contact_events e WHERE e.organization_id=q.organization_id AND e.request_id=q.id AND e.action='contato') AS last_contact_at
   FROM scope q LEFT JOIN public.real_estate_properties p ON p.organization_id=q.organization_id AND p.id=q.property_id LEFT JOIN public.profiles pr ON pr.id=q.responsible_user_id
   LEFT JOIN public.real_estate_interests i ON i.organization_id=q.organization_id AND i.id=q.interest_id LEFT JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id
   LEFT JOIN fluxa_inquiry_private.followups f ON f.organization_id=q.organization_id AND f.request_id=q.id
   WHERE (status_filter IS NULL OR q.status=status_filter) AND (NOT mine OR q.responsible_user_id=auth.uid()) AND (term='' OR strpos(lower(concat_ws(' ',q.name,q.phone,p.code,p.title)),lower(term))>0)
   AND (follow_filter='' OR (q.status<>'encerrado' AND CASE follow_filter WHEN 'none' THEN f.next_contact_at IS NULL WHEN 'overdue' THEN f.next_contact_at<now() WHEN 'today' THEN f.next_contact_at>=now() AND (f.next_contact_at AT TIME ZONE zone)::date=(now() AT TIME ZONE zone)::date WHEN 'future' THEN (f.next_contact_at AT TIME ZONE zone)::date>(now() AT TIME ZONE zone)::date END))
  ),paged AS(SELECT * FROM filtered ORDER BY CASE WHEN next_contact_at<now() THEN 0 WHEN next_contact_at IS NOT NULL THEN 1 WHEN status='encerrado' THEN 3 ELSE 2 END,next_contact_at NULLS LAST,created_at,id LIMIT 20 OFFSET(page-1)*20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY CASE WHEN next_contact_at<now() THEN 0 WHEN next_contact_at IS NOT NULL THEN 1 WHEN status='encerrado' THEN 3 ELSE 2 END,next_contact_at NULLS LAST,created_at,id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;RETURN result;
 END IF;
 RAISE EXCEPTION 'COMMERCIAL_INVALID' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.real_estate_commercial(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_commercial(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
