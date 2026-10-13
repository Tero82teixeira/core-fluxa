-- FLUXA Imobiliária V4: contratos e vencimentos. Requer V1, V2 e V3.
-- Aplicação controlada no Lovable Cloud operacional; não executar db push.
BEGIN;
CREATE TABLE IF NOT EXISTS public.real_estate_contracts (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 property_id uuid NOT NULL, proposal_id uuid NOT NULL, accepted_version integer NOT NULL,
 client_id uuid NOT NULL, purpose text NOT NULL CHECK(purpose IN ('venda','locacao')),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 1 AND 60),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,reference), UNIQUE(organization_id,property_id,id),
 UNIQUE(organization_id,property_id,proposal_id),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.clients(organization_id,id),
 FOREIGN KEY(organization_id,property_id,proposal_id,accepted_version)
 REFERENCES public.real_estate_proposal_events(organization_id,property_id,proposal_id,version)
);
CREATE TABLE IF NOT EXISTS public.real_estate_contract_events (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, property_id uuid NOT NULL, contract_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), action text NOT NULL CHECK(action IN ('criado','renovado','encerrado','cancelado')),
 status text NOT NULL CHECK(status IN ('ativo','encerrado','cancelado')),
 amount numeric NOT NULL CHECK(amount>0 AND amount<1000000000000 AND amount=round(amount,2)),
 terms text NOT NULL CHECK(length(btrim(terms)) BETWEEN 1 AND 4000),
 starts_on date NOT NULL CHECK(starts_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 ends_on date CHECK(ends_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND ends_on>=starts_on),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 4000),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,property_id,contract_id,version),
 FOREIGN KEY(organization_id,property_id,contract_id) REFERENCES public.real_estate_contracts(organization_id,property_id,id)
);
CREATE INDEX IF NOT EXISTS real_estate_contracts_property_idx ON public.real_estate_contracts(organization_id,property_id);
CREATE INDEX IF NOT EXISTS real_estate_contracts_client_idx ON public.real_estate_contracts(organization_id,client_id);
CREATE INDEX IF NOT EXISTS real_estate_contracts_accepted_idx ON public.real_estate_contracts(organization_id,property_id,proposal_id,accepted_version);
CREATE INDEX IF NOT EXISTS real_estate_contract_events_latest_idx ON public.real_estate_contract_events(organization_id,property_id,contract_id,version DESC);
ALTER TABLE public.real_estate_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_estate_contract_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.real_estate_contracts,public.real_estate_contract_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.real_estate_contracts,public.real_estate_contract_events TO authenticated;
DROP POLICY IF EXISTS contracts_read ON public.real_estate_contracts;
CREATE POLICY contracts_read ON public.real_estate_contracts FOR SELECT TO authenticated USING(public.real_estate_enabled(organization_id));
DROP POLICY IF EXISTS contracts_insert ON public.real_estate_contracts;
CREATE POLICY contracts_insert ON public.real_estate_contracts FOR INSERT TO authenticated WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
DROP POLICY IF EXISTS contract_events_read ON public.real_estate_contract_events;
CREATE POLICY contract_events_read ON public.real_estate_contract_events FOR SELECT TO authenticated USING(public.real_estate_enabled(organization_id));
DROP POLICY IF EXISTS contract_events_insert ON public.real_estate_contract_events;
CREATE POLICY contract_events_insert ON public.real_estate_contract_events FOR INSERT TO authenticated WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));

CREATE OR REPLACE FUNCTION fluxa_real_estate_private.validate_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.real_estate_contracts; previous public.real_estate_contract_events;
 accepted public.real_estate_proposal_events; i public.real_estate_interests; p public.real_estate_properties;
BEGIN
 IF NOT public.real_estate_enabled(NEW.organization_id) OR NOT public.has_org_role(NEW.organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'CONTRACT_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 -- Compartilha a trava com propostas: criação e cancelamento não podem passar juntos.
 PERFORM pg_advisory_xact_lock(hashtextextended('fluxa-proposal:'||NEW.organization_id::text||':'||NEW.property_id::text,0));
 NEW.created_by:=auth.uid(); NEW.created_at:=clock_timestamp();
 IF TG_TABLE_NAME='real_estate_contracts' THEN
  SELECT * INTO accepted FROM public.real_estate_proposal_events WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND proposal_id=NEW.proposal_id ORDER BY version DESC LIMIT 1;
  SELECT t.* INTO i FROM public.real_estate_proposals r JOIN public.real_estate_interests t ON t.organization_id=r.organization_id AND t.property_id=r.property_id AND t.id=r.interest_id WHERE r.organization_id=NEW.organization_id AND r.property_id=NEW.property_id AND r.id=NEW.proposal_id FOR SHARE OF t;
  SELECT * INTO p FROM public.real_estate_properties WHERE organization_id=NEW.organization_id AND id=NEW.property_id FOR SHARE;
  IF accepted.status IS DISTINCT FROM 'aceita' OR NEW.accepted_version IS DISTINCT FROM accepted.version OR i.id IS NULL THEN RAISE EXCEPTION 'CONTRACT_ACCEPTED_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p.id IS NULL OR p.status NOT IN ('disponivel','reservado') OR p.purpose NOT IN (i.purpose,'venda_locacao') OR i.status='encerrado' OR NOT EXISTS(SELECT 1 FROM public.clients WHERE organization_id=NEW.organization_id AND id=i.client_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'CONTRACT_PROPERTY_CLOSED' USING ERRCODE='22023'; END IF;
  NEW.client_id:=i.client_id; NEW.purpose:=i.purpose; NEW.reference:=btrim(NEW.reference);
  RETURN NEW;
 END IF;
 SELECT * INTO c FROM public.real_estate_contracts WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND id=NEW.contract_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'CONTRACT_LINK_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM public.real_estate_contract_events WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND contract_id=NEW.contract_id ORDER BY version DESC LIMIT 1;
 IF NEW.version<>coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'CONTRACT_CONFLICT' USING ERRCODE='40001'; END IF;
 NEW.terms:=btrim(NEW.terms); NEW.note:=btrim(NEW.note);
 IF previous.id IS NULL THEN
  SELECT * INTO accepted FROM public.real_estate_proposal_events WHERE organization_id=c.organization_id AND property_id=c.property_id AND proposal_id=c.proposal_id ORDER BY version DESC LIMIT 1;
  IF NEW.action<>'criado' OR accepted.status IS DISTINCT FROM 'aceita' OR accepted.version IS DISTINCT FROM c.accepted_version THEN RAISE EXCEPTION 'CONTRACT_ACCEPTED_REQUIRED' USING ERRCODE='22023'; END IF;
  IF ROW(NEW.amount,NEW.terms) IS DISTINCT FROM ROW(accepted.amount,accepted.terms) THEN RAISE EXCEPTION 'CONTRACT_ACCEPTED_TERMS' USING ERRCODE='22023'; END IF;
 ELSE
  IF previous.status<>'ativo' OR NEW.action='criado' THEN RAISE EXCEPTION 'CONTRACT_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
  IF NEW.action='renovado' THEN
   IF c.purpose<>'locacao' OR NEW.ends_on IS NULL OR NEW.ends_on<=previous.ends_on OR NEW.starts_on IS DISTINCT FROM previous.starts_on OR NEW.ends_on<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'CONTRACT_RENEWAL_INVALID' USING ERRCODE='22023'; END IF;
  ELSIF ROW(NEW.amount,NEW.terms,NEW.starts_on,NEW.ends_on) IS DISTINCT FROM ROW(previous.amount,previous.terms,previous.starts_on,previous.ends_on) THEN RAISE EXCEPTION 'CONTRACT_TERMS_IMMUTABLE' USING ERRCODE='22023'; END IF;
 END IF;
 IF c.purpose='locacao' AND NEW.ends_on IS NULL THEN RAISE EXCEPTION 'CONTRACT_END_REQUIRED' USING ERRCODE='22023'; END IF;
 NEW.status:=CASE WHEN NEW.action IN ('criado','renovado') THEN 'ativo' ELSE NEW.action END;
 IF NEW.status='ativo' AND EXISTS(SELECT 1 FROM public.real_estate_contracts r CROSS JOIN LATERAL(SELECT e.status FROM public.real_estate_contract_events e WHERE e.organization_id=r.organization_id AND e.property_id=r.property_id AND e.contract_id=r.id ORDER BY e.version DESC LIMIT 1) latest WHERE r.organization_id=c.organization_id AND r.property_id=c.property_id AND r.purpose=c.purpose AND r.id<>c.id AND latest.status='ativo') THEN RAISE EXCEPTION 'CONTRACT_ALREADY_ACTIVE' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.validate_contract() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_validate ON public.real_estate_contracts;
CREATE TRIGGER contract_validate BEFORE INSERT ON public.real_estate_contracts FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_contract();
DROP TRIGGER IF EXISTS contract_validate ON public.real_estate_contract_events;
CREATE TRIGGER contract_validate BEFORE INSERT ON public.real_estate_contract_events FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_contract();

CREATE OR REPLACE FUNCTION fluxa_real_estate_private.protect_contracted_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('fluxa-proposal:'||NEW.organization_id::text||':'||NEW.property_id::text,0));
 IF NEW.action='cancelada' AND EXISTS(SELECT 1 FROM public.real_estate_contracts c CROSS JOIN LATERAL(SELECT e.status FROM public.real_estate_contract_events e WHERE e.organization_id=c.organization_id AND e.property_id=c.property_id AND e.contract_id=c.id ORDER BY e.version DESC LIMIT 1) latest WHERE c.organization_id=NEW.organization_id AND c.property_id=NEW.property_id AND c.proposal_id=NEW.proposal_id AND latest.status='ativo') THEN RAISE EXCEPTION 'CONTRACT_ACTIVE_PROPOSAL' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.protect_contracted_proposal() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proposal_contract_guard ON public.real_estate_proposal_events;
CREATE TRIGGER proposal_contract_guard BEFORE INSERT ON public.real_estate_proposal_events FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.protect_contracted_proposal();

CREATE OR REPLACE FUNCTION fluxa_real_estate_private.audit_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CONTRACT_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(NEW.organization_id,auth.uid(),'real_estate.contract_'||NEW.action,'real_estate_contract_events',NEW.id,jsonb_build_object('property_id',NEW.property_id,'contract_id',NEW.contract_id,'version',NEW.version,'status',NEW.status));
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.audit_contract() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS contract_audit ON public.real_estate_contract_events;
CREATE TRIGGER contract_audit AFTER INSERT ON public.real_estate_contract_events FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.audit_contract();

CREATE OR REPLACE FUNCTION public.record_real_estate_contract(_organization_id uuid,_property_id uuid,_contract_id uuid,_proposal_id uuid,_request_id uuid,_expected_version integer,_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.real_estate_contract_events; existing public.real_estate_contract_events; c public.real_estate_contracts; accepted public.real_estate_proposal_events;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) OR NOT public.has_org_role(_organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'CONTRACT_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF _property_id IS NULL OR _contract_id IS NULL OR _proposal_id IS NULL OR _request_id IS NULL OR _values IS NULL OR jsonb_typeof(_values)<>'object' OR (_expected_version IS NOT NULL AND _expected_version<1) THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fluxa-proposal:'||_organization_id::text||':'||_property_id::text,0));
 e.id:=_request_id; e.organization_id:=_organization_id; e.property_id:=_property_id; e.contract_id:=_contract_id; e.version:=coalesce(_expected_version,0)+1;
 e.action:=_values->>'action'; e.amount:=(_values->>'amount')::numeric; e.terms:=btrim(_values->>'terms'); e.starts_on:=(_values->>'starts_on')::date; e.ends_on:=nullif(_values->>'ends_on','')::date; e.note:=btrim(_values->>'note');
 SELECT * INTO c FROM public.real_estate_contracts WHERE organization_id=_organization_id AND property_id=_property_id AND id=_contract_id;
 IF c.id IS NOT NULL AND (c.proposal_id IS DISTINCT FROM _proposal_id OR c.reference IS DISTINCT FROM btrim(_values->>'reference')) THEN RAISE EXCEPTION 'CONTRACT_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO existing FROM public.real_estate_contract_events WHERE id=_request_id;
 IF existing.id IS NOT NULL THEN
  IF ROW(existing.organization_id,existing.property_id,existing.contract_id,existing.version,existing.action,existing.amount,existing.terms,existing.starts_on,existing.ends_on,existing.note) IS DISTINCT FROM ROW(e.organization_id,e.property_id,e.contract_id,e.version,e.action,e.amount,e.terms,e.starts_on,e.ends_on,e.note) THEN RAISE EXCEPTION 'CONTRACT_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN to_jsonb(existing);
 END IF;
 IF _expected_version IS NULL THEN
  IF c.id IS NOT NULL THEN RAISE EXCEPTION 'CONTRACT_CONFLICT' USING ERRCODE='40001'; END IF;
  SELECT * INTO accepted FROM public.real_estate_proposal_events WHERE organization_id=_organization_id AND property_id=_property_id AND proposal_id=_proposal_id ORDER BY version DESC LIMIT 1;
  INSERT INTO public.real_estate_contracts(id,organization_id,property_id,proposal_id,accepted_version,client_id,purpose,reference,created_by) VALUES(_contract_id,_organization_id,_property_id,_proposal_id,accepted.version,auth.uid(),'venda',btrim(_values->>'reference'),auth.uid());
 ELSIF c.id IS NULL THEN RAISE EXCEPTION 'CONTRACT_LINK_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO public.real_estate_contract_events(id,organization_id,property_id,contract_id,version,action,status,amount,terms,starts_on,ends_on,note,created_by) VALUES(e.id,e.organization_id,e.property_id,e.contract_id,e.version,e.action,'ativo',e.amount,e.terms,e.starts_on,e.ends_on,e.note,auth.uid()) RETURNING * INTO existing;
 RETURN to_jsonb(existing);
END; $$;

CREATE OR REPLACE FUNCTION public.list_real_estate_contracts(_organization_id uuid,_property_id uuid DEFAULT NULL,_status text DEFAULT NULL,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'CONTRACT_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<1 OR _page>100000 OR (_status IS NOT NULL AND _status NOT IN ('ativo','futuro','a_vencer','vencido','encerrado','cancelado')) THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 WITH current_events AS(
 SELECT c.id,c.proposal_id,c.reference,c.client_id,c.purpose,c.property_id,p.code AS property_code,p.title AS property_title,client.name AS client_name,e.version,e.status,e.amount,e.terms,e.starts_on,e.ends_on,e.note,e.created_at AS updated_at,
 CASE WHEN e.status<>'ativo' THEN e.status WHEN e.starts_on>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'futuro' WHEN e.ends_on<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'vencido' WHEN e.ends_on<=(now() AT TIME ZONE 'America/Sao_Paulo')::date+30 THEN 'a_vencer' ELSE 'ativo' END AS display_status
 FROM public.real_estate_contracts c JOIN public.real_estate_properties p ON p.organization_id=c.organization_id AND p.id=c.property_id LEFT JOIN public.clients client ON client.organization_id=c.organization_id AND client.id=c.client_id CROSS JOIN LATERAL(SELECT * FROM public.real_estate_contract_events v WHERE v.organization_id=c.organization_id AND v.property_id=c.property_id AND v.contract_id=c.id ORDER BY version DESC LIMIT 1) e WHERE c.organization_id=_organization_id AND (_property_id IS NULL OR c.property_id=_property_id)
 ), filtered AS(SELECT * FROM current_events WHERE _status IS NULL OR (_status='ativo' AND status='ativo') OR display_status=_status), paged AS(SELECT * FROM filtered ORDER BY ends_on ASC NULLS LAST,updated_at DESC,id LIMIT 20 OFFSET (_page-1)*20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ends_on ASC NULLS LAST,p.updated_at DESC,p.id) FROM paged p),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.real_estate_contract_history(_organization_id uuid,_property_id uuid,_contract_id uuid,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'CONTRACT_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<1 OR _page>100000 THEN RAISE EXCEPTION 'CONTRACT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 WITH filtered AS(SELECT e.*,p.full_name AS actor_name FROM public.real_estate_contract_events e LEFT JOIN public.profiles p ON p.id=e.created_by WHERE e.organization_id=_organization_id AND e.property_id=_property_id AND e.contract_id=_contract_id), paged AS(SELECT * FROM filtered ORDER BY version DESC LIMIT 20 OFFSET (_page-1)*20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.version DESC) FROM paged p),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.real_estate_contract_options(_organization_id uuid,_property_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'CONTRACT_READ_DENIED' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'client_name',c.name,'purpose',i.purpose,'amount',e.amount,'terms',e.terms) ORDER BY c.name,r.id) FROM public.real_estate_proposals r JOIN public.real_estate_interests i ON i.organization_id=r.organization_id AND i.property_id=r.property_id AND i.id=r.interest_id JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id JOIN public.real_estate_properties p ON p.organization_id=r.organization_id AND p.id=r.property_id CROSS JOIN LATERAL(SELECT * FROM public.real_estate_proposal_events v WHERE v.organization_id=r.organization_id AND v.property_id=r.property_id AND v.proposal_id=r.id ORDER BY version DESC LIMIT 1) e WHERE r.organization_id=_organization_id AND r.property_id=_property_id AND e.status='aceita' AND c.archived_at IS NULL AND i.status<>'encerrado' AND p.status IN ('disponivel','reservado') AND p.purpose IN (i.purpose,'venda_locacao') AND NOT EXISTS(SELECT 1 FROM public.real_estate_contracts ct WHERE ct.organization_id=r.organization_id AND ct.property_id=r.property_id AND ct.proposal_id=r.id)),'[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.record_real_estate_contract(uuid,uuid,uuid,uuid,uuid,integer,jsonb),public.list_real_estate_contracts(uuid,uuid,text,integer),public.real_estate_contract_history(uuid,uuid,uuid,integer),public.real_estate_contract_options(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_real_estate_contract(uuid,uuid,uuid,uuid,uuid,integer,jsonb),public.list_real_estate_contracts(uuid,uuid,text,integer),public.real_estate_contract_history(uuid,uuid,uuid,integer),public.real_estate_contract_options(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
