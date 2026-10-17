-- FLUXA: próximos retornos e histórico interno. Requer real-estate-inquiries.sql.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='fluxa_inquiry_private.requests'::regclass AND conname='inquiry_org_id_key') THEN
 ALTER TABLE fluxa_inquiry_private.requests ADD CONSTRAINT inquiry_org_id_key UNIQUE(organization_id,id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS fluxa_inquiry_private.followups (
 organization_id uuid NOT NULL,request_id uuid NOT NULL,next_contact_at timestamptz CHECK(next_contact_at IS NULL OR isfinite(next_contact_at)),
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid NOT NULL,
 PRIMARY KEY(organization_id,request_id),FOREIGN KEY(organization_id,request_id) REFERENCES fluxa_inquiry_private.requests(organization_id,id)
);
CREATE TABLE IF NOT EXISTS fluxa_inquiry_private.contact_events (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('retorno','contato')),
 channel text NOT NULL CHECK(channel IN ('planejamento','whatsapp','telefone','email','presencial','outro')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000),next_contact_at timestamptz,
 occurred_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,
 FOREIGN KEY(organization_id,request_id) REFERENCES fluxa_inquiry_private.requests(organization_id,id)
);
CREATE INDEX IF NOT EXISTS inquiry_linked_interest_idx ON fluxa_inquiry_private.requests(organization_id,interest_id) WHERE interest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS followup_due_idx ON fluxa_inquiry_private.followups(organization_id,next_contact_at,request_id) WHERE next_contact_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_events_request_idx ON fluxa_inquiry_private.contact_events(organization_id,request_id,occurred_at DESC,id);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['followups','contact_events'] LOOP
 EXECUTE format('ALTER TABLE fluxa_inquiry_private.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON fluxa_inquiry_private.%I FROM PUBLIC,anon,authenticated',tab);
 EXECUTE format('GRANT SELECT,INSERT ON fluxa_inquiry_private.%I TO authenticated',tab);
 EXECUTE format('DROP POLICY IF EXISTS staff_read ON fluxa_inquiry_private.%I',tab);
 EXECUTE format('CREATE POLICY staff_read ON fluxa_inquiry_private.%I FOR SELECT TO authenticated USING(fluxa_catalog_private.staff_access(organization_id))',tab);
 EXECUTE format('DROP POLICY IF EXISTS staff_insert ON fluxa_inquiry_private.%I',tab);
 EXECUTE format('CREATE POLICY staff_insert ON fluxa_inquiry_private.%I FOR INSERT TO authenticated WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true))',tab);
 END LOOP;
END $$;
GRANT UPDATE ON fluxa_inquiry_private.followups TO authenticated;
DROP POLICY IF EXISTS staff_update ON fluxa_inquiry_private.followups;
CREATE POLICY staff_update ON fluxa_inquiry_private.followups FOR UPDATE TO authenticated USING(fluxa_catalog_private.staff_access(organization_id,true)) WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true));
CREATE OR REPLACE FUNCTION fluxa_inquiry_private.stamp_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT fluxa_catalog_private.staff_access(NEW.organization_id,true) THEN RAISE EXCEPTION 'INQUIRY_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 NEW.created_by:=auth.uid();NEW.occurred_at:=clock_timestamp();RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fluxa_inquiry_private.stamp_contact() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stamp_contact ON fluxa_inquiry_private.contact_events;
CREATE TRIGGER stamp_contact BEFORE INSERT ON fluxa_inquiry_private.contact_events FOR EACH ROW EXECUTE FUNCTION fluxa_inquiry_private.stamp_contact();
CREATE OR REPLACE FUNCTION public.real_estate_followups(_organization_id uuid,_action text,_request_id uuid DEFAULT NULL,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r fluxa_inquiry_private.requests; previous fluxa_inquiry_private.contact_events;
 page integer; zone text; status_filter text; follow_filter text; mine boolean; term text; next_at timestamptz;
 client uuid; log_id uuid; log_note text; log_channel text; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT fluxa_catalog_private.staff_access(_organization_id) THEN RAISE EXCEPTION 'INQUIRY_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 page:=coalesce((_values->>'page')::integer,1);
 IF page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 IF _action IN ('set','contact','history') THEN
  SELECT * INTO r FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND id=_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'INQUIRY_READ_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 IF _action IN ('set','contact') THEN
  IF NOT fluxa_catalog_private.staff_access(_organization_id,true) THEN RAISE EXCEPTION 'INQUIRY_WRITE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND id=_request_id FOR UPDATE;
  log_id:=(_values->>'event_id')::uuid;
  next_at:=nullif(_values->>'next_contact_at','')::timestamptz;
  log_channel:=CASE WHEN _action='set' THEN 'planejamento' ELSE _values->>'channel' END;
  log_note:=btrim(coalesce(_values->>'note',''));
  IF _action='set' AND log_note='' THEN log_note:=CASE WHEN next_at IS NULL THEN 'Próximo retorno removido.' ELSE 'Próximo retorno definido.' END; END IF;
  IF log_id IS NULL OR length(log_note) NOT BETWEEN 1 AND 2000 OR coalesce(log_channel,'') NOT IN ('planejamento','whatsapp','telefone','email','presencial','outro') OR (_action='contact' AND log_channel='planejamento') THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO previous FROM fluxa_inquiry_private.contact_events WHERE id=log_id;
  IF previous.id IS NOT NULL THEN
   IF previous.organization_id=_organization_id AND previous.request_id=_request_id AND previous.created_by=auth.uid() AND previous.note=log_note AND previous.channel=log_channel AND previous.next_contact_at IS NOT DISTINCT FROM next_at AND previous.action=(CASE WHEN _action='set' THEN 'retorno' ELSE 'contato' END) THEN RETURN '{"saved":true}'::jsonb; END IF;
   RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF r.version IS DISTINCT FROM (_values->>'version')::bigint THEN RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001'; END IF;
  IF next_at IS NOT NULL AND (r.status='encerrado' OR NOT isfinite(next_at) OR next_at<=now() OR next_at>now()+interval '2 years') THEN RAISE EXCEPTION 'FOLLOWUP_FUTURE_REQUIRED' USING ERRCODE='22023'; END IF;
  INSERT INTO fluxa_inquiry_private.followups(organization_id,request_id,next_contact_at,updated_by) VALUES(_organization_id,r.id,next_at,auth.uid())
   ON CONFLICT(organization_id,request_id) DO UPDATE SET next_contact_at=excluded.next_contact_at,updated_at=clock_timestamp(),updated_by=auth.uid();
  INSERT INTO fluxa_inquiry_private.contact_events(id,organization_id,request_id,action,channel,note,next_contact_at,created_by)
   VALUES(log_id,_organization_id,r.id,CASE WHEN _action='set' THEN 'retorno' ELSE 'contato' END,log_channel,log_note,next_at,auth.uid());
  UPDATE fluxa_inquiry_private.requests SET version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=r.id AND organization_id=_organization_id;
  RETURN '{"saved":true}'::jsonb;
 ELSIF _action='load' THEN
  zone:=coalesce(nullif(_values->>'timezone',''),'America/Sao_Paulo');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  status_filter:=nullif(_values->>'status','');follow_filter:=coalesce(_values->>'followup','');mine:=coalesce((_values->>'mine')::boolean,false);term:=left(btrim(coalesce(_values->>'search','')),120);
  IF follow_filter NOT IN ('','overdue','today','future','none') THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  WITH filtered AS MATERIALIZED(SELECT q.*,p.code AS property_code,p.title AS property_title,pr.full_name AS responsible_name,c.name AS client_name,
   CASE WHEN q.status<>'encerrado' THEN f.next_contact_at ELSE NULL END AS next_contact_at,
   (SELECT max(e.occurred_at) FROM fluxa_inquiry_private.contact_events e WHERE e.organization_id=q.organization_id AND e.request_id=q.id AND e.action='contato') AS last_contact_at
   FROM fluxa_inquiry_private.requests q JOIN public.real_estate_properties p ON p.organization_id=q.organization_id AND p.id=q.property_id
   LEFT JOIN public.profiles pr ON pr.id=q.responsible_user_id
   LEFT JOIN public.real_estate_interests i ON i.organization_id=q.organization_id AND i.id=q.interest_id
   LEFT JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id
   LEFT JOIN fluxa_inquiry_private.followups f ON f.organization_id=q.organization_id AND f.request_id=q.id
   WHERE q.organization_id=_organization_id AND (status_filter IS NULL OR q.status=status_filter) AND (NOT mine OR q.responsible_user_id=auth.uid())
   AND (term='' OR strpos(lower(concat_ws(' ',q.name,q.phone,p.code,p.title)),lower(term))>0)
   AND (follow_filter='' OR (q.status<>'encerrado' AND CASE follow_filter WHEN 'none' THEN f.next_contact_at IS NULL WHEN 'overdue' THEN f.next_contact_at<now() WHEN 'today' THEN f.next_contact_at>=now() AND (f.next_contact_at AT TIME ZONE zone)::date=(now() AT TIME ZONE zone)::date WHEN 'future' THEN (f.next_contact_at AT TIME ZONE zone)::date>(now() AT TIME ZONE zone)::date END))
  ),paged AS(SELECT * FROM filtered ORDER BY CASE WHEN next_contact_at<now() THEN 0 WHEN next_contact_at IS NOT NULL THEN 1 WHEN status='encerrado' THEN 3 ELSE 2 END,next_contact_at NULLS LAST,created_at,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY CASE WHEN next_contact_at<now() THEN 0 WHEN next_contact_at IS NOT NULL THEN 1 WHEN status='encerrado' THEN 3 ELSE 2 END,next_contact_at NULLS LAST,created_at,id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
  RETURN result;
 ELSIF _action='history' THEN
  SELECT i.client_id INTO client FROM public.real_estate_interests i WHERE i.organization_id=_organization_id AND i.id=r.interest_id;
  WITH interests AS MATERIALIZED(SELECT * FROM public.real_estate_interests i WHERE i.organization_id=_organization_id AND client IS NOT NULL AND i.client_id=client),
  scope AS MATERIALIZED(SELECT * FROM fluxa_inquiry_private.requests q WHERE q.organization_id=_organization_id AND (q.id=r.id OR q.interest_id IN (SELECT id FROM interests))),
  events AS(
   SELECT 'pedido'::text AS kind,q.id::text AS id,q.property_id,q.created_at AS happened_at,q.status AS status,q.message AS note,NULL::numeric AS amount,NULL::timestamptz AS next_contact_at FROM scope q
   UNION ALL SELECT 'interesse',i.id::text,i.property_id,i.created_at,i.status,NULL,NULL,NULL FROM interests i
   UNION ALL SELECT 'visita',v.id::text,v.property_id,v.starts_at,v.status,v.outcome,NULL,NULL FROM public.real_estate_visits v WHERE v.organization_id=_organization_id AND v.interest_id IN (SELECT id FROM interests)
   UNION ALL SELECT 'proposta',pr.id::text,pr.property_id,e.created_at,e.status,e.note,e.amount,NULL FROM public.real_estate_proposals pr CROSS JOIN LATERAL(SELECT * FROM public.real_estate_proposal_events e WHERE e.organization_id=pr.organization_id AND e.property_id=pr.property_id AND e.proposal_id=pr.id ORDER BY e.version DESC LIMIT 1)e WHERE pr.organization_id=_organization_id AND pr.interest_id IN (SELECT id FROM interests)
   UNION ALL SELECT e.action,e.id::text,q.property_id,e.occurred_at,e.channel,e.note,NULL,e.next_contact_at FROM fluxa_inquiry_private.contact_events e JOIN scope q ON q.id=e.request_id AND q.organization_id=e.organization_id WHERE e.organization_id=_organization_id
  ),enriched AS MATERIALIZED(SELECT events.*,p.code AS property_code,p.title AS property_title FROM events JOIN public.real_estate_properties p ON p.id=events.property_id AND p.organization_id=_organization_id),
  paged AS(SELECT * FROM enriched ORDER BY happened_at DESC,kind,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('client_name',(SELECT c.name FROM public.clients c WHERE c.organization_id=_organization_id AND c.id=client),'linked',client IS NOT NULL,
  'items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY happened_at DESC,kind,id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM enriched)) INTO result;
  RETURN result;
 END IF;
 RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.real_estate_followups(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_followups(uuid,text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
