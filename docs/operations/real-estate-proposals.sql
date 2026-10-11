-- FLUXA V3: propostas e negociações. Requer fundação + interessados/visitas.
-- Aplicação manual no banco operacional. Sem DELETE/UPDATE do histórico.
BEGIN;
CREATE TABLE IF NOT EXISTS public.real_estate_proposals (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 property_id uuid NOT NULL, interest_id uuid NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,interest_id) REFERENCES public.real_estate_interests(organization_id,property_id,id)
);
CREATE TABLE IF NOT EXISTS public.real_estate_proposal_events (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, property_id uuid NOT NULL, proposal_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), action text NOT NULL CHECK(action IN ('aberta','contraproposta','revisao','aceita','recusada','cancelada')),
 status text NOT NULL CHECK(status IN ('aberta','contraproposta','aceita','recusada','cancelada')),
 amount numeric NOT NULL CHECK(amount>0 AND amount<1000000000000 AND amount=round(amount,2)),
 terms text NOT NULL CHECK(length(btrim(terms)) BETWEEN 1 AND 4000),
 valid_until date NOT NULL CHECK(valid_until BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 party text NOT NULL CHECK(party IN ('interessado','proprietario','imobiliaria')),
 note text CHECK(length(note)<=4000), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,property_id,proposal_id,version),
 FOREIGN KEY(organization_id,property_id,proposal_id) REFERENCES public.real_estate_proposals(organization_id,property_id,id)
);
CREATE INDEX IF NOT EXISTS real_estate_proposals_interest_idx ON public.real_estate_proposals(organization_id,property_id,interest_id);
CREATE INDEX IF NOT EXISTS real_estate_proposal_events_latest_idx ON public.real_estate_proposal_events(organization_id,property_id,proposal_id,version DESC);
ALTER TABLE public.real_estate_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_estate_proposal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.real_estate_proposals,public.real_estate_proposal_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.real_estate_proposals,public.real_estate_proposal_events TO authenticated;
DROP POLICY IF EXISTS proposals_read ON public.real_estate_proposals;
CREATE POLICY proposals_read ON public.real_estate_proposals FOR SELECT TO authenticated USING(public.real_estate_enabled(organization_id));
DROP POLICY IF EXISTS proposals_insert ON public.real_estate_proposals;
CREATE POLICY proposals_insert ON public.real_estate_proposals FOR INSERT TO authenticated WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
DROP POLICY IF EXISTS proposal_events_read ON public.real_estate_proposal_events;
CREATE POLICY proposal_events_read ON public.real_estate_proposal_events FOR SELECT TO authenticated USING(public.real_estate_enabled(organization_id));
DROP POLICY IF EXISTS proposal_events_insert ON public.real_estate_proposal_events;
CREATE POLICY proposal_events_insert ON public.real_estate_proposal_events FOR INSERT TO authenticated WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.validate_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.real_estate_proposal_events; interested public.real_estate_interests; p public.real_estate_properties;
BEGIN
 IF NOT public.real_estate_enabled(NEW.organization_id) OR NOT public.has_org_role(NEW.organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'PROPOSAL_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 NEW.created_by:=auth.uid(); NEW.created_at:=clock_timestamp();
 IF TG_TABLE_NAME='real_estate_proposals' THEN RETURN NEW; END IF;
 -- Serializa eventos do imóvel, incluindo aceite de propostas concorrentes.
 PERFORM pg_advisory_xact_lock(hashtextextended('fluxa-proposal:'||NEW.organization_id::text||':'||NEW.property_id::text,0));
 SELECT i.* INTO interested FROM public.real_estate_proposals r JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.id=r.interest_id WHERE r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.id=NEW.proposal_id FOR SHARE OF i;
 IF interested.id IS NULL THEN RAISE EXCEPTION 'PROPOSAL_LINK_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM public.real_estate_proposal_events WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND proposal_id=NEW.proposal_id ORDER BY version DESC LIMIT 1;
 IF NEW.version<>coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'PROPOSAL_CONFLICT' USING ERRCODE='40001'; END IF;
 IF previous.id IS NULL THEN
  IF NEW.action<>'aberta' THEN RAISE EXCEPTION 'PROPOSAL_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.real_estate_proposals r CROSS JOIN LATERAL(SELECT e.status FROM public.real_estate_proposal_events e WHERE e.organization_id=r.organization_id AND e.property_id=r.property_id AND e.proposal_id=r.id ORDER BY e.version DESC LIMIT 1) latest WHERE r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.interest_id=interested.id AND latest.status IN ('aberta','contraproposta','aceita')) THEN RAISE EXCEPTION 'PROPOSAL_ALREADY_ACTIVE' USING ERRCODE='22023'; END IF;
 ELSE
  IF NEW.action='aberta' OR previous.status IN ('recusada','cancelada') OR (previous.status='aceita' AND NEW.action<>'cancelada') THEN RAISE EXCEPTION 'PROPOSAL_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
 END IF;
 NEW.status:=CASE WHEN NEW.action='revisao' THEN previous.status ELSE NEW.action END;
 NEW.terms:=btrim(NEW.terms); NEW.note:=nullif(btrim(NEW.note),'');
 IF NEW.action IN ('aceita','recusada','cancelada') THEN
  IF NEW.note IS NULL THEN RAISE EXCEPTION 'PROPOSAL_NOTE_REQUIRED' USING ERRCODE='22023'; END IF;
  IF ROW(NEW.amount,NEW.terms,NEW.valid_until,NEW.party) IS DISTINCT FROM ROW(previous.amount,previous.terms,previous.valid_until,previous.party) THEN RAISE EXCEPTION 'PROPOSAL_TERMS_IMMUTABLE' USING ERRCODE='22023'; END IF;
 END IF;
 IF NEW.action IN ('aberta','contraproposta','revisao','aceita') THEN
  SELECT * INTO p FROM public.real_estate_properties WHERE organization_id=NEW.organization_id AND id=NEW.property_id FOR SHARE;
  IF p.id IS NULL OR p.status NOT IN ('disponivel','reservado') OR interested.status='encerrado' OR NOT EXISTS(SELECT 1 FROM public.clients WHERE organization_id=NEW.organization_id AND id=interested.client_id AND archived_at IS NULL) OR p.purpose NOT IN (interested.purpose,'venda_locacao') THEN RAISE EXCEPTION 'PROPOSAL_PROPERTY_CLOSED' USING ERRCODE='22023'; END IF;
  IF NEW.valid_until<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'PROPOSAL_EXPIRED' USING ERRCODE='22023'; END IF;
 END IF;
 IF NEW.action='aceita' AND EXISTS(SELECT 1 FROM public.real_estate_proposals r JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.id=r.interest_id CROSS JOIN LATERAL(SELECT e.status FROM public.real_estate_proposal_events e WHERE e.organization_id=r.organization_id AND e.property_id=r.property_id AND e.proposal_id=r.id ORDER BY e.version DESC LIMIT 1) latest WHERE r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.id<>NEW.proposal_id AND i.purpose=interested.purpose AND latest.status='aceita') THEN RAISE EXCEPTION 'PROPOSAL_ALREADY_ACCEPTED' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.validate_proposal() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proposal_validate ON public.real_estate_proposals;
CREATE TRIGGER proposal_validate BEFORE INSERT ON public.real_estate_proposals FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_proposal();
DROP TRIGGER IF EXISTS proposal_validate ON public.real_estate_proposal_events;
CREATE TRIGGER proposal_validate BEFORE INSERT ON public.real_estate_proposal_events FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_proposal();
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.audit_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PROPOSAL_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
 VALUES(NEW.organization_id,auth.uid(),'real_estate.proposal_'||NEW.action,'real_estate_proposal_events',NEW.id,jsonb_build_object('property_id',NEW.property_id,'proposal_id',NEW.proposal_id,'status',NEW.status,'version',NEW.version));
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.audit_proposal() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proposal_audit ON public.real_estate_proposal_events;
CREATE TRIGGER proposal_audit AFTER INSERT ON public.real_estate_proposal_events FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.audit_proposal();
CREATE OR REPLACE FUNCTION public.record_real_estate_negotiation(_organization_id uuid,_property_id uuid,_proposal_id uuid,_request_id uuid,_expected_version integer,_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.real_estate_proposal_events; existing public.real_estate_proposal_events; interest uuid; proposal public.real_estate_proposals;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) OR NOT public.has_org_role(_organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'PROPOSAL_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF _proposal_id IS NULL OR _request_id IS NULL OR _property_id IS NULL OR _values IS NULL OR jsonb_typeof(_values)<>'object' OR (_expected_version IS NOT NULL AND _expected_version<1) THEN RAISE EXCEPTION 'PROPOSAL_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fluxa-proposal:'||_organization_id::text||':'||_property_id::text,0));
 interest:=(_values->>'interest_id')::uuid;
 e.id:=_request_id; e.organization_id:=_organization_id; e.property_id:=_property_id; e.proposal_id:=_proposal_id; e.version:=coalesce(_expected_version,0)+1;
 e.action:=_values->>'action'; e.amount:=(_values->>'amount')::numeric; e.terms:=btrim(_values->>'terms'); e.valid_until:=(_values->>'valid_until')::date; e.party:=_values->>'party'; e.note:=nullif(btrim(_values->>'note'),'');
 SELECT * INTO proposal FROM public.real_estate_proposals WHERE organization_id=_organization_id AND property_id=_property_id AND id=_proposal_id;
 IF proposal.id IS NOT NULL AND proposal.interest_id IS DISTINCT FROM interest THEN RAISE EXCEPTION 'PROPOSAL_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO existing FROM public.real_estate_proposal_events WHERE id=_request_id;
 IF existing.id IS NOT NULL THEN
  IF ROW(existing.organization_id,existing.property_id,existing.proposal_id,existing.version,existing.action,existing.amount,existing.terms,existing.valid_until,existing.party,existing.note) IS DISTINCT FROM ROW(e.organization_id,e.property_id,e.proposal_id,e.version,e.action,e.amount,e.terms,e.valid_until,e.party,e.note) THEN RAISE EXCEPTION 'PROPOSAL_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN to_jsonb(existing);
 END IF;
 IF _expected_version IS NULL THEN
  IF proposal.id IS NOT NULL THEN RAISE EXCEPTION 'PROPOSAL_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.real_estate_proposals(id,organization_id,property_id,interest_id,created_by) VALUES(_proposal_id,_organization_id,_property_id,interest,auth.uid());
 ELSIF proposal.id IS NULL THEN RAISE EXCEPTION 'PROPOSAL_LINK_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO public.real_estate_proposal_events(id,organization_id,property_id,proposal_id,version,action,status,amount,terms,valid_until,party,note,created_by)
 VALUES(e.id,e.organization_id,e.property_id,e.proposal_id,e.version,e.action,'aberta',e.amount,e.terms,e.valid_until,e.party,e.note,auth.uid()) RETURNING * INTO existing;
 RETURN to_jsonb(existing);
END; $$;
CREATE OR REPLACE FUNCTION public.list_real_estate_proposals(_organization_id uuid,_property_id uuid,_status text DEFAULT NULL,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'PROPOSAL_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<1 OR _page>100000 OR (_status IS NOT NULL AND _status NOT IN ('aberta','contraproposta','aceita','recusada','cancelada','vencida')) THEN RAISE EXCEPTION 'PROPOSAL_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 WITH current_events AS (
 SELECT r.id,r.interest_id,i.purpose,c.name AS client_name,e.version,e.status,e.amount,e.terms,e.valid_until,e.party,e.note,e.created_at AS updated_at,
 CASE WHEN e.status IN ('aberta','contraproposta') AND e.valid_until<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'vencida' ELSE e.status END AS display_status
 FROM public.real_estate_proposals r JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.id=r.interest_id LEFT JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id
 CROSS JOIN LATERAL(SELECT * FROM public.real_estate_proposal_events v WHERE v.organization_id=r.organization_id AND v.property_id=r.property_id AND v.proposal_id=r.id ORDER BY v.version DESC LIMIT 1) e WHERE r.organization_id=_organization_id AND r.property_id=_property_id
 ), filtered AS(SELECT * FROM current_events WHERE _status IS NULL OR display_status=_status), paged AS(SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT 20 OFFSET (_page-1)*20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC,p.id) FROM paged p),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.real_estate_proposal_history(_organization_id uuid,_property_id uuid,_proposal_id uuid,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'PROPOSAL_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<1 OR _page>100000 THEN RAISE EXCEPTION 'PROPOSAL_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 WITH filtered AS(SELECT e.*,p.full_name AS actor_name FROM public.real_estate_proposal_events e LEFT JOIN public.profiles p ON p.id=e.created_by WHERE e.organization_id=_organization_id AND e.property_id=_property_id AND e.proposal_id=_proposal_id), paged AS(SELECT * FROM filtered ORDER BY version DESC LIMIT 20 OFFSET (_page-1)*20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.version DESC) FROM paged p),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.real_estate_proposal_options(_organization_id uuid,_property_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'PROPOSAL_READ_DENIED' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'client_name',c.name,'purpose',i.purpose) ORDER BY c.name,i.id) FROM public.real_estate_interests i JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id WHERE i.organization_id=_organization_id AND i.property_id=_property_id AND i.status<>'encerrado' AND c.archived_at IS NULL),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.record_real_estate_negotiation(uuid,uuid,uuid,uuid,integer,jsonb),public.list_real_estate_proposals(uuid,uuid,text,integer),public.real_estate_proposal_history(uuid,uuid,uuid,integer),public.real_estate_proposal_options(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_real_estate_negotiation(uuid,uuid,uuid,uuid,integer,jsonb),public.list_real_estate_proposals(uuid,uuid,text,integer),public.real_estate_proposal_history(uuid,uuid,uuid,integer),public.real_estate_proposal_options(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
