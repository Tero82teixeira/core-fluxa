-- Imobiliária V5: demonstrativos de comissão e repasse, sem transferência bancária.
BEGIN;
CREATE TABLE IF NOT EXISTS public.real_estate_settlements (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 property_id uuid NOT NULL, contract_id uuid NOT NULL, contract_version integer NOT NULL,
 owner_client_id uuid NOT NULL, reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 60),
 gross numeric NOT NULL CHECK(gross>0 AND gross<1000000000000 AND gross=round(gross,2)),
 commission_type text NOT NULL CHECK(commission_type IN ('percentual','fixa')),
 commission_value numeric NOT NULL CHECK(commission_value>=0 AND commission_value=round(commission_value,2)),
 commission_amount numeric GENERATED ALWAYS AS (CASE WHEN commission_type='percentual' THEN round(gross*commission_value/100,2) ELSE commission_value END) STORED,
 due_on date NOT NULL CHECK(due_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((commission_type='percentual' AND commission_value<=100) OR (commission_type='fixa' AND commission_value<=gross)),
 UNIQUE(organization_id,property_id,id),
 FOREIGN KEY(organization_id,owner_client_id) REFERENCES public.clients(organization_id,id),
 FOREIGN KEY(organization_id,property_id,contract_id,contract_version) REFERENCES public.real_estate_contract_events(organization_id,property_id,contract_id,version)
);
CREATE TABLE IF NOT EXISTS public.real_estate_settlement_events (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, property_id uuid NOT NULL, settlement_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0), action text NOT NULL CHECK(action IN ('criado','recebido','repassado','cancelado')),
 status text NOT NULL CHECK(status IN ('previsto','recebido','repassado','cancelado')),
 occurred_on date CHECK(occurred_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 4000),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,property_id,settlement_id,version),
 FOREIGN KEY(organization_id,property_id,settlement_id) REFERENCES public.real_estate_settlements(organization_id,property_id,id)
);
CREATE INDEX IF NOT EXISTS real_estate_settlements_contract_idx ON public.real_estate_settlements(organization_id,contract_id,reference);
CREATE INDEX IF NOT EXISTS real_estate_settlements_owner_idx ON public.real_estate_settlements(organization_id,owner_client_id);
CREATE INDEX IF NOT EXISTS real_estate_settlement_events_latest_idx ON public.real_estate_settlement_events(organization_id,property_id,settlement_id,version DESC);
ALTER TABLE public.real_estate_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.real_estate_settlement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.real_estate_settlements,public.real_estate_settlement_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.real_estate_settlements,public.real_estate_settlement_events TO authenticated;
CREATE OR REPLACE FUNCTION public.real_estate_settlement_access(_org uuid,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.real_estate_enabled(_org) AND (NOT _write OR public.has_org_role(_org,ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]));
$$;
REVOKE ALL ON FUNCTION public.real_estate_settlement_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_settlement_access(uuid,boolean) TO authenticated;
DROP POLICY IF EXISTS settlements_read ON public.real_estate_settlements;
CREATE POLICY settlements_read ON public.real_estate_settlements FOR SELECT TO authenticated USING(public.real_estate_settlement_access(organization_id));
DROP POLICY IF EXISTS settlements_insert ON public.real_estate_settlements;
CREATE POLICY settlements_insert ON public.real_estate_settlements FOR INSERT TO authenticated WITH CHECK(public.real_estate_settlement_access(organization_id,true));
DROP POLICY IF EXISTS settlement_events_read ON public.real_estate_settlement_events;
CREATE POLICY settlement_events_read ON public.real_estate_settlement_events FOR SELECT TO authenticated USING(public.real_estate_settlement_access(organization_id));
DROP POLICY IF EXISTS settlement_events_insert ON public.real_estate_settlement_events;
CREATE POLICY settlement_events_insert ON public.real_estate_settlement_events FOR INSERT TO authenticated WITH CHECK(public.real_estate_settlement_access(organization_id,true));
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.validate_settlement()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.real_estate_settlements; previous public.real_estate_settlement_events; ct public.real_estate_contracts; ce public.real_estate_contract_events; p public.real_estate_properties; month_date date;
BEGIN
 IF NOT public.real_estate_settlement_access(NEW.organization_id,true) THEN RAISE EXCEPTION 'SETTLEMENT_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fluxa-proposal:'||NEW.organization_id::text||':'||NEW.property_id::text,0));
 NEW.created_by:=auth.uid(); NEW.created_at:=clock_timestamp();
 IF TG_TABLE_NAME='real_estate_settlements' THEN
  SELECT * INTO ct FROM public.real_estate_contracts WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND id=NEW.contract_id;
  SELECT * INTO ce FROM public.real_estate_contract_events WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND contract_id=NEW.contract_id ORDER BY version DESC LIMIT 1;
  -- Snapshot do proprietário visível neste registro; SELECT não exige permissão de editar imóvel.
  SELECT * INTO p FROM public.real_estate_properties WHERE organization_id=NEW.organization_id AND id=NEW.property_id;
  IF ct.id IS NULL OR ce.id IS NULL OR ce.status='cancelado' OR NEW.contract_version IS DISTINCT FROM ce.version THEN RAISE EXCEPTION 'SETTLEMENT_CONTRACT_INVALID' USING ERRCODE='22023'; END IF;
  IF NEW.owner_client_id IS DISTINCT FROM p.owner_client_id OR NOT EXISTS(SELECT 1 FROM public.clients WHERE organization_id=NEW.organization_id AND id=NEW.owner_client_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'SETTLEMENT_OWNER_INVALID' USING ERRCODE='22023'; END IF;
  NEW.reference:=upper(btrim(NEW.reference));
  IF ct.purpose='locacao' THEN
   IF NEW.reference !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'SETTLEMENT_PERIOD_INVALID' USING ERRCODE='22023'; END IF;
   month_date:=(NEW.reference||'-01')::date;
   IF month_date<date_trunc('month',ce.starts_on)::date OR month_date>date_trunc('month',ce.ends_on)::date OR (ce.status='encerrado' AND month_date>date_trunc('month',ce.created_at AT TIME ZONE 'America/Sao_Paulo')::date) THEN RAISE EXCEPTION 'SETTLEMENT_PERIOD_INVALID' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO s FROM public.real_estate_settlements WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND id=NEW.settlement_id;
 IF s.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_LINK_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM public.real_estate_settlement_events WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND settlement_id=NEW.settlement_id ORDER BY version DESC LIMIT 1;
 IF NEW.version<>coalesce(previous.version,0)+1 THEN RAISE EXCEPTION 'SETTLEMENT_CONFLICT' USING ERRCODE='40001'; END IF;
 IF previous.id IS NULL THEN
  IF NEW.action<>'criado' THEN RAISE EXCEPTION 'SETTLEMENT_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.real_estate_settlements r CROSS JOIN LATERAL(SELECT status FROM public.real_estate_settlement_events e WHERE e.organization_id=r.organization_id AND e.property_id=r.property_id AND e.settlement_id=r.id ORDER BY version DESC LIMIT 1) last_event WHERE r.organization_id=s.organization_id AND r.contract_id=s.contract_id AND r.reference=s.reference AND r.id<>s.id AND last_event.status<>'cancelado') THEN RAISE EXCEPTION 'SETTLEMENT_DUPLICATE' USING ERRCODE='22023'; END IF;
 ELSIF NOT ((previous.status='previsto' AND NEW.action IN ('recebido','cancelado')) OR (previous.status='recebido' AND NEW.action='repassado')) THEN RAISE EXCEPTION 'SETTLEMENT_TRANSITION_INVALID' USING ERRCODE='22023'; END IF;
 NEW.status:=CASE NEW.action WHEN 'criado' THEN 'previsto' ELSE NEW.action END;
 NEW.note:=btrim(NEW.note);
 IF NEW.action IN ('recebido','repassado') THEN
  IF NEW.occurred_on IS NULL OR NEW.occurred_on>(now() AT TIME ZONE 'America/Sao_Paulo')::date OR (NEW.action='repassado' AND NEW.occurred_on<previous.occurred_on) THEN RAISE EXCEPTION 'SETTLEMENT_DATE_INVALID' USING ERRCODE='22023'; END IF;
 ELSIF NEW.occurred_on IS NOT NULL THEN RAISE EXCEPTION 'SETTLEMENT_DATE_INVALID' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.validate_settlement() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS settlement_validate ON public.real_estate_settlements;
CREATE TRIGGER settlement_validate BEFORE INSERT ON public.real_estate_settlements FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_settlement();
DROP TRIGGER IF EXISTS settlement_validate ON public.real_estate_settlement_events;
CREATE TRIGGER settlement_validate BEFORE INSERT ON public.real_estate_settlement_events FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_settlement();
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.audit_settlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(NEW.organization_id,auth.uid(),'real_estate.settlement_'||NEW.action,'real_estate_settlement_events',NEW.id,jsonb_build_object('settlement_id',NEW.settlement_id,'property_id',NEW.property_id,'version',NEW.version,'status',NEW.status)); RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.audit_settlement() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS settlement_audit ON public.real_estate_settlement_events;
CREATE TRIGGER settlement_audit AFTER INSERT ON public.real_estate_settlement_events FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.audit_settlement();
CREATE OR REPLACE FUNCTION public.record_real_estate_settlement(_organization_id uuid,_property_id uuid,_settlement_id uuid,_contract_id uuid,_request_id uuid,_expected_version integer,_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.real_estate_settlements; ce public.real_estate_contract_events; existing public.real_estate_settlement_events; e public.real_estate_settlement_events;
BEGIN
 IF NOT public.real_estate_settlement_access(_organization_id,true) THEN RAISE EXCEPTION 'SETTLEMENT_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF _settlement_id IS NULL OR _contract_id IS NULL OR _property_id IS NULL OR _request_id IS NULL OR _values IS NULL OR jsonb_typeof(_values)<>'object' OR (_expected_version IS NOT NULL AND _expected_version<1) THEN RAISE EXCEPTION 'SETTLEMENT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fluxa-proposal:'||_organization_id::text||':'||_property_id::text,0));
 SELECT * INTO s FROM public.real_estate_settlements WHERE organization_id=_organization_id AND property_id=_property_id AND id=_settlement_id;
 IF s.id IS NOT NULL AND ROW(s.contract_id,s.owner_client_id,s.reference,s.gross,s.commission_type,s.commission_value,s.due_on) IS DISTINCT FROM ROW(_contract_id,(_values->>'owner_client_id')::uuid,upper(btrim(_values->>'reference')),(_values->>'gross')::numeric,_values->>'commission_type',(_values->>'commission_value')::numeric,(_values->>'due_on')::date) THEN RAISE EXCEPTION 'SETTLEMENT_CONFLICT' USING ERRCODE='40001'; END IF;
 e.id:=_request_id; e.organization_id:=_organization_id; e.property_id:=_property_id; e.settlement_id:=_settlement_id; e.version:=coalesce(_expected_version,0)+1; e.action:=_values->>'action'; e.note:=btrim(_values->>'note'); e.occurred_on:=nullif(_values->>'occurred_on','')::date;
 SELECT * INTO existing FROM public.real_estate_settlement_events WHERE id=_request_id;
 IF existing.id IS NOT NULL THEN
  IF ROW(existing.organization_id,existing.property_id,existing.settlement_id,existing.version,existing.action,existing.note,existing.occurred_on) IS DISTINCT FROM ROW(e.organization_id,e.property_id,e.settlement_id,e.version,e.action,e.note,e.occurred_on) THEN RAISE EXCEPTION 'SETTLEMENT_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN to_jsonb(existing);
 END IF;
 IF _expected_version IS NULL THEN
  IF s.id IS NOT NULL THEN RAISE EXCEPTION 'SETTLEMENT_CONFLICT' USING ERRCODE='40001'; END IF;
  SELECT * INTO ce FROM public.real_estate_contract_events WHERE organization_id=_organization_id AND property_id=_property_id AND contract_id=_contract_id ORDER BY version DESC LIMIT 1;
  INSERT INTO public.real_estate_settlements(id,organization_id,property_id,contract_id,contract_version,owner_client_id,reference,gross,commission_type,commission_value,due_on,created_by) VALUES(_settlement_id,_organization_id,_property_id,_contract_id,ce.version,(_values->>'owner_client_id')::uuid,upper(btrim(_values->>'reference')),(_values->>'gross')::numeric,_values->>'commission_type',(_values->>'commission_value')::numeric,(_values->>'due_on')::date,auth.uid());
 ELSIF s.id IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_LINK_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO public.real_estate_settlement_events(id,organization_id,property_id,settlement_id,version,action,status,occurred_on,note,created_by) VALUES(e.id,e.organization_id,e.property_id,e.settlement_id,e.version,e.action,'previsto',e.occurred_on,e.note,auth.uid()) RETURNING * INTO existing;
 RETURN to_jsonb(existing);
END; $$;
CREATE OR REPLACE FUNCTION public.list_real_estate_settlements(_organization_id uuid,_property_id uuid DEFAULT NULL,_status text DEFAULT NULL,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.real_estate_settlement_access(_organization_id) THEN RAISE EXCEPTION 'SETTLEMENT_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<1 OR _page>100000 OR (_status IS NOT NULL AND _status NOT IN ('previsto','recebido','repassado','cancelado','atrasado')) THEN RAISE EXCEPTION 'SETTLEMENT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 WITH current_events AS(
 SELECT s.*,s.gross-s.commission_amount AS owner_amount,ct.reference AS contract_reference,p.code AS property_code,c.name AS owner_name,e.version,e.status,e.occurred_on,e.note,e.created_at AS updated_at,CASE WHEN e.status='recebido' AND s.due_on<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'atrasado' ELSE e.status END AS display_status
 FROM public.real_estate_settlements s JOIN public.real_estate_contracts ct ON ct.organization_id=s.organization_id AND ct.property_id=s.property_id AND ct.id=s.contract_id JOIN public.real_estate_properties p ON p.organization_id=s.organization_id AND p.id=s.property_id LEFT JOIN public.clients c ON c.organization_id=s.organization_id AND c.id=s.owner_client_id CROSS JOIN LATERAL(SELECT * FROM public.real_estate_settlement_events v WHERE v.organization_id=s.organization_id AND v.property_id=s.property_id AND v.settlement_id=s.id ORDER BY version DESC LIMIT 1) e WHERE s.organization_id=_organization_id AND (_property_id IS NULL OR s.property_id=_property_id)
 ),filtered AS(SELECT * FROM current_events WHERE _status IS NULL OR status=_status OR display_status=_status),paged AS(SELECT * FROM filtered ORDER BY due_on,id LIMIT 20 OFFSET (_page-1)*20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.due_on,p.id) FROM paged p),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'totals',jsonb_build_object('commission_received',coalesce((SELECT sum(commission_amount) FROM current_events WHERE status IN ('recebido','repassado')),0),'owner_pending',coalesce((SELECT sum(owner_amount) FROM current_events WHERE status='recebido'),0),'owner_paid',coalesce((SELECT sum(owner_amount) FROM current_events WHERE status='repassado'),0))) INTO result; RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.real_estate_settlement_options(_organization_id uuid,_property_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.real_estate_settlement_access(_organization_id) THEN RAISE EXCEPTION 'SETTLEMENT_READ_DENIED' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',ct.id,'property_id',ct.property_id,'reference',ct.reference,'property_code',p.code,'owner_client_id',p.owner_client_id,'owner_name',c.name,'purpose',ct.purpose,'amount',ce.amount,'starts_on',ce.starts_on,'ends_on',CASE WHEN ce.status='encerrado' THEN least(ce.ends_on,(ce.created_at AT TIME ZONE 'America/Sao_Paulo')::date) ELSE ce.ends_on END,'contract_status',ce.status) ORDER BY p.code,ct.reference) FROM public.real_estate_contracts ct JOIN public.real_estate_properties p ON p.organization_id=ct.organization_id AND p.id=ct.property_id JOIN public.clients c ON c.organization_id=p.organization_id AND c.id=p.owner_client_id CROSS JOIN LATERAL(SELECT * FROM public.real_estate_contract_events v WHERE v.organization_id=ct.organization_id AND v.property_id=ct.property_id AND v.contract_id=ct.id ORDER BY version DESC LIMIT 1) ce WHERE ct.organization_id=_organization_id AND (_property_id IS NULL OR ct.property_id=_property_id) AND ce.status<>'cancelado' AND c.archived_at IS NULL),'[]'::jsonb);
END; $$;
CREATE OR REPLACE FUNCTION public.real_estate_settlement_history(_organization_id uuid,_property_id uuid,_settlement_id uuid,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.real_estate_settlement_access(_organization_id) THEN RAISE EXCEPTION 'SETTLEMENT_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<1 OR _page>100000 THEN RAISE EXCEPTION 'SETTLEMENT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 WITH filtered AS(SELECT e.*,p.full_name AS actor_name FROM public.real_estate_settlement_events e LEFT JOIN public.profiles p ON p.id=e.created_by WHERE e.organization_id=_organization_id AND e.property_id=_property_id AND e.settlement_id=_settlement_id),paged AS(SELECT * FROM filtered ORDER BY version DESC LIMIT 20 OFFSET (_page-1)*20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.version DESC) FROM paged p),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result; RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.record_real_estate_settlement(uuid,uuid,uuid,uuid,uuid,integer,jsonb),public.list_real_estate_settlements(uuid,uuid,text,integer),public.real_estate_settlement_options(uuid,uuid),public.real_estate_settlement_history(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_real_estate_settlement(uuid,uuid,uuid,uuid,uuid,integer,jsonb),public.list_real_estate_settlements(uuid,uuid,text,integer),public.real_estate_settlement_options(uuid,uuid),public.real_estate_settlement_history(uuid,uuid,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
