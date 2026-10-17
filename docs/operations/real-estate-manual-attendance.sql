-- Atendimento manual após catálogo, fila, retornos e preferências.
BEGIN;
ALTER TABLE fluxa_inquiry_private.requests ALTER COLUMN listing_id DROP NOT NULL, ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE fluxa_inquiry_private.requests ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'vitrine', ADD COLUMN IF NOT EXISTS closure_reason text, ADD COLUMN IF NOT EXISTS closure_note text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS closed_at timestamptz, ADD COLUMN IF NOT EXISTS created_by uuid, ADD COLUMN IF NOT EXISTS creation_hash text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='fluxa_inquiry_private.requests'::regclass AND conname='inquiry_manual_fields') THEN
  ALTER TABLE fluxa_inquiry_private.requests ADD CONSTRAINT inquiry_manual_fields CHECK(
   origin IN ('vitrine','whatsapp','telefone','presencial','outro') AND
   (origin<>'vitrine' OR (listing_id IS NOT NULL AND property_id IS NOT NULL)) AND
   (origin='vitrine' OR listing_id IS NULL) AND
   (closure_reason IS NULL OR closure_reason IN ('fechou_negocio','desistiu','sem_imovel','outro')) AND length(closure_note)<=1500 AND (closed_at IS NULL OR isfinite(closed_at)) AND (creation_hash IS NULL OR length(creation_hash)=32));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_open_general_contact_idx ON fluxa_inquiry_private.requests(organization_id,phone,purpose) WHERE status<>'encerrado' AND property_id IS NULL;
CREATE OR REPLACE FUNCTION fluxa_inquiry_private.validate_manual_request()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.creation_hash IS DISTINCT FROM OLD.creation_hash) THEN RAISE EXCEPTION 'INQUIRY_IMMUTABLE' USING ERRCODE='22023'; END IF;
 IF TG_OP='INSERT' AND NEW.origin<>'vitrine' THEN
  IF auth.uid() IS NULL OR NOT fluxa_catalog_private.staff_access(NEW.organization_id,true) OR NEW.created_by IS DISTINCT FROM auth.uid() OR NEW.creation_hash IS NULL THEN RAISE EXCEPTION 'INQUIRY_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 END IF;
 IF (TG_OP='INSERT' AND NEW.origin<>'vitrine' AND NEW.property_id IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.property_id IS DISTINCT FROM OLD.property_id) THEN
  IF TG_OP='UPDATE' AND (OLD.property_id IS NOT NULL OR OLD.origin='vitrine' OR OLD.interest_id IS NOT NULL OR OLD.visit_id IS NOT NULL OR OLD.status='encerrado') THEN RAISE EXCEPTION 'INQUIRY_IMMUTABLE' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.real_estate_properties p WHERE p.id=NEW.property_id AND p.organization_id=NEW.organization_id AND p.purpose IN (NEW.purpose,'venda_locacao') AND p.status IN ('disponivel','reservado')) THEN RAISE EXCEPTION 'INQUIRY_PROPERTY_INVALID' USING ERRCODE='22023'; END IF;
 END IF;
 IF NEW.responsible_user_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.responsible_user_id IS DISTINCT FROM OLD.responsible_user_id) AND NOT EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.responsible_user_id AND m.is_active AND m.role IN ('superadmin','proprietario','administrador','gestor','operacional')) THEN RAISE EXCEPTION 'REAL_ESTATE_RESPONSIBLE_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.status='encerrado' AND (TG_OP='INSERT' OR OLD.status<>'encerrado') THEN
  IF NEW.closure_reason IS NULL OR (NEW.closure_reason='outro' AND length(btrim(NEW.closure_note))<2) THEN RAISE EXCEPTION 'INQUIRY_CLOSURE_REQUIRED' USING ERRCODE='22023'; END IF;
  NEW.closed_at:=clock_timestamp();
 ELSIF NEW.status<>'encerrado' THEN NEW.closure_reason:=NULL;NEW.closure_note:='';NEW.closed_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION fluxa_inquiry_private.validate_manual_request() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validate_manual_request ON fluxa_inquiry_private.requests;
CREATE TRIGGER validate_manual_request BEFORE INSERT OR UPDATE ON fluxa_inquiry_private.requests FOR EACH ROW EXECUTE FUNCTION fluxa_inquiry_private.validate_manual_request();
CREATE OR REPLACE FUNCTION public.real_estate_manual_attendance(_organization_id uuid,_action text,_request_id uuid,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r fluxa_inquiry_private.requests; existing fluxa_inquiry_private.requests; v_phone text; pid uuid; responsible uuid; next_at timestamptz; current_next timestamptz; wanted text; source text; v_status text; reason text; detail text; log_note text; fingerprint text;
BEGIN
 IF auth.uid() IS NULL OR NOT fluxa_catalog_private.staff_access(_organization_id,true) THEN RAISE EXCEPTION 'INQUIRY_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF _request_id IS NULL OR _values IS NULL OR jsonb_typeof(_values)<>'object' OR octet_length(_values::text)>12000 THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 IF _action='create' THEN
  source:=_values->>'origin';wanted:=_values->'preferences'->>'purpose';
  v_phone:=regexp_replace(coalesce(_values->>'phone',''),'[^0-9]','','g');IF length(v_phone) IN (10,11) THEN v_phone:='55'||v_phone; END IF;
  IF coalesce(source,'') NOT IN ('whatsapp','telefone','presencial','outro') OR coalesce(wanted,'') NOT IN ('venda','locacao') OR length(btrim(coalesce(_values->>'name',''))) NOT BETWEEN 2 AND 120 OR v_phone !~ '^55[1-9][0-9]{9,10}$' OR length(coalesce(_values->>'internal_note',''))>2000 THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  responsible:=nullif(_values->>'responsible_user_id','')::uuid;
  fingerprint:=md5(_values::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('inquiry:'||_organization_id::text,0));
  SELECT * INTO r FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND id=_request_id;
  IF r.id IS NOT NULL THEN
   IF r.created_by=auth.uid() AND r.creation_hash=fingerprint THEN RETURN jsonb_build_object('id',r.id,'name',r.name,'duplicate',false); END IF;
   RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001';
  END IF;
  SELECT * INTO existing FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND property_id IS NULL AND phone=v_phone AND purpose=wanted AND status<>'encerrado' ORDER BY created_at,id LIMIT 1;
  IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('id',existing.id,'name',existing.name,'duplicate',true); END IF;
  INSERT INTO fluxa_inquiry_private.requests(id,organization_id,name,phone,purpose,kind,origin,responsible_user_id,internal_note,consent_version,created_by,creation_hash,updated_by)
   VALUES(_request_id,_organization_id,btrim(_values->>'name'),v_phone,wanted,'informacao',source,responsible,btrim(coalesce(_values->>'internal_note','')),'staff-contact-v1',auth.uid(),fingerprint,auth.uid()) RETURNING * INTO r;
  PERFORM public.real_estate_preferences(_organization_id,'save',r.id,jsonb_build_object('version',0,'preferences',_values->'preferences'));
 ELSIF _action IN ('update','attach') THEN
  SELECT * INTO r FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND id=_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'INQUIRY_READ_DENIED' USING ERRCODE='42501'; END IF;
  IF r.version IS DISTINCT FROM (_values->>'version')::bigint THEN RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001'; END IF;
  IF _action='attach' THEN
   pid:=(_values->>'property_id')::uuid;
   IF r.origin='vitrine' OR r.property_id IS NOT NULL OR pid IS NULL OR r.status='encerrado' THEN RAISE EXCEPTION 'INQUIRY_PROPERTY_INVALID' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM fluxa_inquiry_private.requests q WHERE q.organization_id=_organization_id AND q.id<>r.id AND q.property_id=pid AND q.phone=r.phone AND q.purpose=r.purpose AND q.status<>'encerrado') THEN RAISE EXCEPTION 'INQUIRY_DUPLICATE_PROPERTY' USING ERRCODE='22023'; END IF;
   UPDATE fluxa_inquiry_private.requests SET property_id=pid,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=r.id AND organization_id=_organization_id;
   RETURN jsonb_build_object('id',r.id,'name',r.name,'duplicate',false);
  END IF;
  v_status:=_values->>'status';reason:=nullif(_values->>'closure_reason','');detail:=btrim(coalesce(_values->>'closure_note',''));responsible:=nullif(_values->>'responsible_user_id','')::uuid;
  IF coalesce(v_status,'') NOT IN ('novo','em_contato','encerrado') OR length(coalesce(_values->>'internal_note',''))>2000 OR length(detail)>1500 THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  IF v_status='encerrado' AND r.status='encerrado' THEN RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE fluxa_inquiry_private.requests SET status=v_status,responsible_user_id=responsible,internal_note=btrim(coalesce(_values->>'internal_note','')),closure_reason=reason,closure_note=detail,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE organization_id=_organization_id AND id=r.id RETURNING * INTO r;
  IF v_status='encerrado' THEN
   log_note:='Atendimento encerrado: '||CASE reason WHEN 'fechou_negocio' THEN 'Fechou negócio' WHEN 'desistiu' THEN 'Desistiu' WHEN 'sem_imovel' THEN 'Sem imóvel adequado' ELSE 'Outro motivo' END||CASE WHEN detail<>'' THEN '. '||detail ELSE '.' END;
   INSERT INTO fluxa_inquiry_private.contact_events(organization_id,request_id,id,action,channel,note,created_by) VALUES(_organization_id,r.id,gen_random_uuid(),'contato','outro',log_note,auth.uid());
  END IF;
 ELSE RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023';
 END IF;
 next_at:=CASE WHEN r.status='encerrado' THEN NULL ELSE nullif(_values->>'next_contact_at','')::timestamptz END;
 SELECT next_contact_at INTO current_next FROM fluxa_inquiry_private.followups WHERE organization_id=_organization_id AND request_id=r.id;
 IF current_next IS DISTINCT FROM next_at THEN
  PERFORM public.real_estate_followups(_organization_id,'set',r.id,jsonb_build_object('version',r.version,'event_id',gen_random_uuid(),'next_contact_at',next_at));
 END IF;
 RETURN jsonb_build_object('id',r.id,'name',r.name,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.real_estate_manual_attendance(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_manual_attendance(uuid,text,uuid,jsonb) TO authenticated;

-- Cadastros internos não consomem o limite de proteção do formulário anônimo.
CREATE OR REPLACE FUNCTION fluxa_inquiry_private.submit(_token uuid,_listing_id uuid,_request_id uuid,_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; pid uuid; wanted text; v_phone text; day date; period text;
BEGIN
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' OR octet_length(_values::text)>6000 OR _request_id IS NULL THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 IF coalesce(_values->>'website','')<>'' THEN RETURN '{"accepted":true}'::jsonb; END IF;
 IF coalesce(_values->>'consent','')<>'true' OR length(btrim(coalesce(_values->>'name',''))) NOT BETWEEN 2 AND 120
  OR length(coalesce(_values->>'message',''))>500 OR coalesce(_values->>'kind','') NOT IN ('informacao','visita')
  THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 v_phone:=regexp_replace(coalesce(_values->>'phone',''),'[^0-9]','','g');
 IF length(v_phone) IN (10,11) THEN v_phone:='55'||v_phone; END IF;
 IF v_phone !~ '^55[1-9][0-9]{9,10}$' THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 wanted:=_values->>'purpose';
 IF coalesce(wanted,'') NOT IN ('venda','locacao') THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 day:=nullif(_values->>'preferred_day','')::date; period:=nullif(_values->>'preferred_period','');
 IF (day IS NOT NULL AND (day<current_date-1 OR day>current_date+90)) OR (period IS NOT NULL AND period NOT IN ('manha','tarde','noite')) THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 IF to_regclass('public.real_estate_properties') IS NULL THEN RAISE EXCEPTION 'INQUIRY_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 SELECT l.organization_id,l.property_id INTO org,pid FROM fluxa_catalog_private.listings l
 JOIN fluxa_catalog_private.storefronts s ON s.organization_id=l.organization_id AND s.token=_token
 JOIN public.real_estate_properties p ON p.organization_id=l.organization_id AND p.id=l.property_id
 WHERE l.id=_listing_id AND fluxa_catalog_private.is_public_listing(l.id) AND p.purpose IN (wanted,'venda_locacao');
 IF org IS NULL THEN RAISE EXCEPTION 'INQUIRY_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('inquiry:'||org::text,0));
 -- Reenvios não alteram dados nem revelam se já havia um contato cadastrado.
 IF EXISTS(SELECT 1 FROM fluxa_inquiry_private.requests WHERE organization_id=org AND (id=_request_id OR (property_id=pid AND requests.phone=v_phone AND purpose=wanted AND status<>'encerrado'))) THEN RETURN '{"accepted":true}'::jsonb; END IF;
 IF (SELECT count(*) FROM fluxa_inquiry_private.requests WHERE organization_id=org AND origin='vitrine' AND created_at>now()-interval '1 day')>=200
  OR (SELECT count(*) FROM fluxa_inquiry_private.requests WHERE organization_id=org AND origin='vitrine' AND requests.phone=v_phone AND created_at>now()-interval '1 day')>=5
 THEN RAISE EXCEPTION 'INQUIRY_LIMIT' USING ERRCODE='P0001'; END IF;
 INSERT INTO fluxa_inquiry_private.requests(id,organization_id,listing_id,property_id,name,phone,purpose,kind,preferred_day,preferred_period,message)
 VALUES(_request_id,org,_listing_id,pid,btrim(_values->>'name'),v_phone,wanted,_values->>'kind',day,period,btrim(coalesce(_values->>'message',''))) ON CONFLICT(id) DO NOTHING;
 RETURN '{"accepted":true}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION fluxa_inquiry_private.submit(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fluxa_inquiry_private.submit(uuid,uuid,uuid,jsonb) TO anon,authenticated;

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
   FROM fluxa_inquiry_private.requests q LEFT JOIN public.real_estate_properties p ON p.organization_id=q.organization_id AND p.id=q.property_id
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
  ),enriched AS MATERIALIZED(SELECT events.*,p.code AS property_code,p.title AS property_title FROM events LEFT JOIN public.real_estate_properties p ON p.id=events.property_id AND p.organization_id=_organization_id),
  paged AS(SELECT * FROM enriched ORDER BY happened_at DESC,kind,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('client_name',(SELECT c.name FROM public.clients c WHERE c.organization_id=_organization_id AND c.id=client),'linked',client IS NOT NULL,
  'items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY happened_at DESC,kind,id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM enriched)) INTO result;
  RETURN result;
 END IF;
 RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.real_estate_followups(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_followups(uuid,text,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.real_estate_inquiry_manage(_organization_id uuid,_action text,_request_id uuid DEFAULT NULL,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r fluxa_inquiry_private.requests; rec record; existing record; responsible uuid; client uuid; iid uuid; saved jsonb;
 page integer; status_filter text; mine boolean; term text; result jsonb; v_visit uuid;
BEGIN
 IF NOT fluxa_catalog_private.staff_access(_organization_id) OR auth.uid() IS NULL THEN RAISE EXCEPTION 'INQUIRY_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 IF _action<>'load' THEN
  IF NOT fluxa_catalog_private.staff_access(_organization_id,true) THEN RAISE EXCEPTION 'INQUIRY_WRITE_DENIED' USING ERRCODE='42501'; END IF;
  IF _request_id IS NOT NULL THEN
   SELECT * INTO r FROM fluxa_inquiry_private.requests WHERE id=_request_id AND organization_id=_organization_id FOR UPDATE;
   IF r.id IS NULL THEN RAISE EXCEPTION 'INQUIRY_READ_DENIED' USING ERRCODE='42501'; END IF;
   IF r.version IS DISTINCT FROM (_values->>'version')::bigint THEN RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001'; END IF;
  END IF;
 END IF;
 CASE _action
 WHEN 'update' THEN
  IF r.id IS NULL OR coalesce(_values->>'status','') NOT IN ('novo','em_contato','encerrado') OR length(coalesce(_values->>'internal_note',''))>2000 THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  responsible:=nullif(_values->>'responsible_user_id','')::uuid;
  IF responsible IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=responsible AND is_active AND role IN ('superadmin','proprietario','administrador','gestor','operacional')) THEN RAISE EXCEPTION 'REAL_ESTATE_RESPONSIBLE_INVALID' USING ERRCODE='22023'; END IF;
  UPDATE fluxa_inquiry_private.requests SET status=_values->>'status',responsible_user_id=responsible,internal_note=coalesce(_values->>'internal_note',''),version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=r.id;
 WHEN 'link' THEN
  IF r.property_id IS NULL THEN RAISE EXCEPTION 'INQUIRY_PROPERTY_REQUIRED' USING ERRCODE='22023'; END IF;
  IF r.id IS NULL OR r.status='encerrado' THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  client:=(_values->>'client_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.clients WHERE id=client AND organization_id=_organization_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'INQUIRY_CLIENT_INVALID' USING ERRCODE='22023'; END IF;
  IF r.interest_id IS NOT NULL THEN RAISE EXCEPTION 'INQUIRY_ALREADY_LINKED' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('inquiry-link:'||_organization_id::text||r.property_id::text||client::text,0));
  SELECT * INTO existing FROM public.real_estate_interests WHERE organization_id=_organization_id AND property_id=r.property_id AND client_id=client AND purpose=r.purpose;
  IF FOUND THEN
   IF existing.status='encerrado' THEN RAISE EXCEPTION 'INQUIRY_INTEREST_CLOSED' USING ERRCODE='22023'; END IF;
   iid:=existing.id;
  ELSE
   iid:=gen_random_uuid();
   PERFORM public.save_real_estate_interest(_organization_id,iid,NULL,jsonb_build_object('property_id',r.property_id,'client_id',client,'purpose',r.purpose,'status','novo','responsible_user_id',r.responsible_user_id,'notes',CASE WHEN r.origin='vitrine' THEN 'Origem: solicitação pela vitrine.' ELSE 'Origem: atendimento manual ('||r.origin||').' END));
  END IF;
  UPDATE fluxa_inquiry_private.requests SET interest_id=iid,status='em_contato',version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=r.id;
 WHEN 'schedule' THEN
  IF r.id IS NULL OR r.interest_id IS NULL OR r.status='encerrado' THEN RAISE EXCEPTION 'INQUIRY_LINK_REQUIRED' USING ERRCODE='22023'; END IF;
  IF r.visit_id IS NOT NULL THEN RAISE EXCEPTION 'INQUIRY_ALREADY_SCHEDULED' USING ERRCODE='22023'; END IF;
  v_visit:=gen_random_uuid();
  PERFORM public.save_real_estate_visit(_organization_id,v_visit,NULL,jsonb_build_object('property_id',r.property_id,'interest_id',r.interest_id,'responsible_user_id',(_values->>'responsible_user_id')::uuid,'starts_at',_values->>'starts_at','ends_at',_values->>'ends_at','status','agendada','notes',CASE WHEN r.origin='vitrine' THEN 'Origem: solicitação pela vitrine.' ELSE 'Origem: atendimento manual ('||r.origin||').' END,'outcome',NULL));
  UPDATE fluxa_inquiry_private.requests SET visit_id=v_visit,status='em_contato',version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=r.id;
 WHEN 'confirm' THEN
  v_visit:=(_values->>'visit_id')::uuid;
  SELECT * INTO rec FROM public.real_estate_visits WHERE id=v_visit AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND OR rec.version IS DISTINCT FROM (_values->>'visit_version')::bigint OR rec.status<>'agendada' OR rec.starts_at<=now() THEN RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO fluxa_inquiry_private.confirmations(organization_id,visit_id,starts_at,ends_at,confirmed_by)
   VALUES(_organization_id,v_visit,rec.starts_at,rec.ends_at,auth.uid()) ON CONFLICT(organization_id,visit_id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,confirmed_at=clock_timestamp(),confirmed_by=excluded.confirmed_by;
 WHEN 'visit_result' THEN
  v_visit:=(_values->>'visit_id')::uuid;
  SELECT * INTO rec FROM public.real_estate_visits WHERE id=v_visit AND organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND OR rec.version IS DISTINCT FROM (_values->>'visit_version')::bigint THEN RAISE EXCEPTION 'INQUIRY_CONFLICT' USING ERRCODE='40001'; END IF;
  IF coalesce(_values->>'status','') NOT IN ('agendada','realizada','cancelada','nao_compareceu') THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
  saved:=public.save_real_estate_visit(_organization_id,v_visit,rec.version,jsonb_build_object('property_id',rec.property_id,'interest_id',rec.interest_id,'responsible_user_id',coalesce(nullif(_values->>'responsible_user_id','')::uuid,rec.responsible_user_id),'starts_at',coalesce(nullif(_values->>'starts_at','')::timestamptz,rec.starts_at),'ends_at',coalesce(nullif(_values->>'ends_at','')::timestamptz,rec.ends_at),'status',_values->>'status','notes',rec.notes,'outcome',nullif(btrim(_values->>'outcome'),'')));
 WHEN 'load' THEN NULL;
 ELSE RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023';
 END CASE;
 IF _action<>'load' THEN RETURN '{"saved":true}'::jsonb; END IF;
 page:=coalesce((_values->>'page')::integer,1);status_filter:=nullif(_values->>'status','');mine:=coalesce((_values->>'mine')::boolean,false);term:=left(btrim(coalesce(_values->>'search','')),120);
 IF page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'INQUIRY_INVALID' USING ERRCODE='22023'; END IF;
 IF _values->>'kind'='agenda' THEN
  WITH filtered AS MATERIALIZED(SELECT v.*,p.code AS property_code,p.title AS property_title,c.name AS client_name,pr.full_name AS responsible_name,
   CASE WHEN v.status='agendada' AND cf.starts_at=v.starts_at AND cf.ends_at=v.ends_at THEN cf.confirmed_at ELSE NULL END AS confirmed_at
   FROM public.real_estate_visits v JOIN public.real_estate_properties p ON p.organization_id=v.organization_id AND p.id=v.property_id
   JOIN public.real_estate_interests i ON i.organization_id=v.organization_id AND i.id=v.interest_id
   JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id
   LEFT JOIN public.profiles pr ON pr.id=v.responsible_user_id
   LEFT JOIN fluxa_inquiry_private.confirmations cf ON cf.organization_id=v.organization_id AND cf.visit_id=v.id
   WHERE v.organization_id=_organization_id AND (status_filter IS NULL OR v.status=status_filter) AND (NOT mine OR v.responsible_user_id=auth.uid())
   AND (term='' OR strpos(lower(concat_ws(' ',p.code,p.title,c.name)),lower(term))>0)
  ),paged AS(SELECT * FROM filtered ORDER BY CASE WHEN status='agendada' THEN 0 ELSE 1 END,starts_at,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY CASE WHEN status='agendada' THEN 0 ELSE 1 END,starts_at,id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 ELSE
  WITH filtered AS MATERIALIZED(SELECT q.*,p.code AS property_code,p.title AS property_title,pr.full_name AS responsible_name,c.name AS client_name
   FROM fluxa_inquiry_private.requests q LEFT JOIN public.real_estate_properties p ON p.organization_id=q.organization_id AND p.id=q.property_id
   LEFT JOIN public.profiles pr ON pr.id=q.responsible_user_id
   LEFT JOIN public.real_estate_interests i ON i.organization_id=q.organization_id AND i.id=q.interest_id
   LEFT JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id
   WHERE q.organization_id=_organization_id AND (status_filter IS NULL OR q.status=status_filter) AND (NOT mine OR q.responsible_user_id=auth.uid())
   AND (term='' OR strpos(lower(concat_ws(' ',q.name,q.phone,p.code,p.title)),lower(term))>0)
  ),paged AS(SELECT * FROM filtered ORDER BY CASE status WHEN 'novo' THEN 0 WHEN 'em_contato' THEN 1 ELSE 2 END,created_at,id LIMIT 20 OFFSET (page-1)*20)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY CASE status WHEN 'novo' THEN 0 WHEN 'em_contato' THEN 1 ELSE 2 END,created_at,id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.real_estate_inquiry_manage(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_inquiry_manage(uuid,text,uuid,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
