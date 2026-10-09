-- FLUXA Imobiliária V2 — Interessados e visitas. Aplicar APÓS real-estate-foundation.sql.
-- Execução manual; não altera segmentos, imóveis existentes nem módulos de outras áreas.
BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.real_estate_properties'::regclass AND conname='real_estate_properties_org_id_v2_key') THEN ALTER TABLE public.real_estate_properties ADD CONSTRAINT real_estate_properties_org_id_v2_key UNIQUE(organization_id,id); END IF; END $$;
CREATE TABLE IF NOT EXISTS public.real_estate_interests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 property_id uuid NOT NULL, client_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('venda','locacao')),
 status text NOT NULL DEFAULT 'novo' CHECK(status IN ('novo','em_contato','visitando','encerrado')),
 responsible_user_id uuid, notes text CHECK(length(notes)<=4000),
 version bigint NOT NULL DEFAULT 1, created_by uuid NOT NULL, updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,property_id,client_id,purpose), UNIQUE(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id) REFERENCES public.real_estate_properties(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES public.clients(organization_id,id),
 FOREIGN KEY(organization_id,responsible_user_id) REFERENCES public.organization_members(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.real_estate_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 property_id uuid NOT NULL, interest_id uuid NOT NULL, responsible_user_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'agendada' CHECK(status IN ('agendada','realizada','cancelada','nao_compareceu')),
 notes text CHECK(length(notes)<=4000), outcome text CHECK(length(outcome)<=4000),
 version bigint NOT NULL DEFAULT 1, created_by uuid NOT NULL, updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id,interest_id) REFERENCES public.real_estate_interests(organization_id,property_id,id),
 FOREIGN KEY(organization_id,responsible_user_id) REFERENCES public.organization_members(organization_id,user_id),
 CHECK(isfinite(starts_at) AND isfinite(ends_at)),
 CHECK(ends_at-starts_at BETWEEN interval '15 minutes' AND interval '4 hours'),
 CHECK(status='agendada' OR length(btrim(coalesce(outcome,'')))>0)
);
CREATE INDEX IF NOT EXISTS real_estate_interests_org_property_idx ON public.real_estate_interests(organization_id,property_id,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS real_estate_interests_org_client_idx ON public.real_estate_interests(organization_id,client_id);
CREATE INDEX IF NOT EXISTS real_estate_interests_org_responsible_idx ON public.real_estate_interests(organization_id,responsible_user_id);
CREATE INDEX IF NOT EXISTS real_estate_visits_org_property_idx ON public.real_estate_visits(organization_id,property_id,starts_at DESC,id);
CREATE INDEX IF NOT EXISTS real_estate_visits_interest_idx ON public.real_estate_visits(organization_id,property_id,interest_id);
CREATE INDEX IF NOT EXISTS real_estate_visits_schedule_idx ON public.real_estate_visits(organization_id,responsible_user_id,starts_at,ends_at) WHERE status='agendada';
ALTER TABLE public.real_estate_interests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.real_estate_interests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.real_estate_interests TO authenticated;
DROP POLICY IF EXISTS real_estate_interests_read ON public.real_estate_interests;
CREATE POLICY real_estate_interests_read ON public.real_estate_interests FOR SELECT TO authenticated USING(public.real_estate_enabled(organization_id));
DROP POLICY IF EXISTS real_estate_interests_insert ON public.real_estate_interests;
CREATE POLICY real_estate_interests_insert ON public.real_estate_interests FOR INSERT TO authenticated WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
DROP POLICY IF EXISTS real_estate_interests_update ON public.real_estate_interests;
CREATE POLICY real_estate_interests_update ON public.real_estate_interests FOR UPDATE TO authenticated USING(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[])) WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
ALTER TABLE public.real_estate_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.real_estate_visits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.real_estate_visits TO authenticated;
DROP POLICY IF EXISTS real_estate_visits_read ON public.real_estate_visits;
CREATE POLICY real_estate_visits_read ON public.real_estate_visits FOR SELECT TO authenticated USING(public.real_estate_enabled(organization_id));
DROP POLICY IF EXISTS real_estate_visits_insert ON public.real_estate_visits;
CREATE POLICY real_estate_visits_insert ON public.real_estate_visits FOR INSERT TO authenticated WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
DROP POLICY IF EXISTS real_estate_visits_update ON public.real_estate_visits;
CREATE POLICY real_estate_visits_update ON public.real_estate_visits FOR UPDATE TO authenticated USING(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[])) WITH CHECK(public.real_estate_enabled(organization_id) AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.validate_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.real_estate_properties; interested public.real_estate_interests; lock_key bigint;
BEGIN
 IF NOT public.real_estate_enabled(NEW.organization_id) OR NOT public.has_org_role(NEW.organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'REAL_ESTATE_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.property_id IS DISTINCT FROM OLD.property_id
   OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'REAL_ESTATE_IMMUTABLE' USING ERRCODE='22023'; END IF;
  IF NEW.version<>OLD.version THEN RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
  NEW.version:=OLD.version+1;
 ELSE NEW.created_by:=auth.uid(); NEW.created_at:=now(); NEW.version:=1;
 END IF;
 NEW.updated_by:=auth.uid(); NEW.updated_at:=clock_timestamp();
 SELECT * INTO p FROM public.real_estate_properties WHERE organization_id=NEW.organization_id AND id=NEW.property_id;
 IF p.id IS NULL THEN RAISE EXCEPTION 'REAL_ESTATE_PROPERTY_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.responsible_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.responsible_user_id AND m.is_active AND m.role IN ('superadmin','proprietario','administrador','gestor','operacional')) THEN
  RAISE EXCEPTION 'REAL_ESTATE_RESPONSIBLE_INVALID' USING ERRCODE='22023'; END IF;
 IF TG_TABLE_NAME='real_estate_interests' THEN
  IF TG_OP='UPDATE' AND (NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.purpose IS DISTINCT FROM OLD.purpose) THEN
   RAISE EXCEPTION 'REAL_ESTATE_IMMUTABLE' USING ERRCODE='22023'; END IF;
  IF TG_OP='INSERT' THEN
   IF p.status NOT IN ('disponivel','reservado') THEN RAISE EXCEPTION 'REAL_ESTATE_PROPERTY_CLOSED' USING ERRCODE='22023'; END IF;
   IF p.purpose<>NEW.purpose AND p.purpose<>'venda_locacao' THEN RAISE EXCEPTION 'REAL_ESTATE_PURPOSE_INVALID' USING ERRCODE='22023'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.organization_id=NEW.organization_id AND c.id=NEW.client_id AND c.archived_at IS NULL) THEN
    RAISE EXCEPTION 'REAL_ESTATE_CLIENT_INVALID' USING ERRCODE='22023'; END IF;
  END IF;
  NEW.notes:=nullif(btrim(NEW.notes),'');
 ELSE
  IF TG_OP='UPDATE' AND NEW.interest_id IS DISTINCT FROM OLD.interest_id THEN RAISE EXCEPTION 'REAL_ESTATE_IMMUTABLE' USING ERRCODE='22023'; END IF;
  SELECT * INTO interested FROM public.real_estate_interests WHERE organization_id=NEW.organization_id AND property_id=NEW.property_id AND id=NEW.interest_id;
  IF interested.id IS NULL THEN RAISE EXCEPTION 'REAL_ESTATE_INTEREST_INVALID' USING ERRCODE='22023'; END IF;
  NEW.notes:=nullif(btrim(NEW.notes),''); NEW.outcome:=nullif(btrim(NEW.outcome),'');
  IF NEW.status='agendada' THEN
   IF p.status NOT IN ('disponivel','reservado') OR interested.status='encerrado' THEN RAISE EXCEPTION 'REAL_ESTATE_PROPERTY_CLOSED' USING ERRCODE='22023'; END IF;
   IF TG_OP='INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.starts_at<=now() THEN RAISE EXCEPTION 'REAL_ESTATE_VISIT_FUTURE' USING ERRCODE='22023'; END IF;
   END IF;
   -- Serializa agendas do responsável. Ordem estável evita deadlock ao trocar responsável.
   FOR lock_key IN SELECT DISTINCT hashtextextended(NEW.organization_id::text||':'||r,0) FROM
    unnest(ARRAY[NEW.responsible_user_id::text,CASE WHEN TG_OP='UPDATE' THEN OLD.responsible_user_id::text ELSE NULL END]) r WHERE r IS NOT NULL ORDER BY 1
   LOOP PERFORM pg_advisory_xact_lock(lock_key); END LOOP;
   IF EXISTS(SELECT 1 FROM public.real_estate_visits v WHERE v.organization_id=NEW.organization_id AND v.responsible_user_id=NEW.responsible_user_id AND v.id<>NEW.id AND v.status='agendada' AND v.starts_at<NEW.ends_at AND v.ends_at>NEW.starts_at) THEN
    RAISE EXCEPTION 'REAL_ESTATE_VISIT_OVERLAP' USING ERRCODE='22023'; END IF;
  ELSIF NEW.status IN ('realizada','nao_compareceu') AND NEW.starts_at>now() THEN
   RAISE EXCEPTION 'REAL_ESTATE_VISIT_NOT_STARTED' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.validate_activity() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.audit_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'REAL_ESTATE_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
 VALUES(NEW.organization_id,auth.uid(),'real_estate.'||CASE WHEN TG_TABLE_NAME='real_estate_interests' THEN 'interest' ELSE 'visit' END||CASE WHEN TG_OP='INSERT' THEN '_created' ELSE '_updated' END,
 TG_TABLE_NAME,NEW.id,jsonb_build_object('property_id',NEW.property_id,'status',NEW.status,'version',NEW.version));
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.audit_activity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS activity_validate ON public.real_estate_interests;
CREATE TRIGGER activity_validate BEFORE INSERT OR UPDATE ON public.real_estate_interests FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_activity();
DROP TRIGGER IF EXISTS activity_audit ON public.real_estate_interests;
CREATE TRIGGER activity_audit AFTER INSERT OR UPDATE ON public.real_estate_interests FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.audit_activity();
DROP TRIGGER IF EXISTS activity_validate ON public.real_estate_visits;
CREATE TRIGGER activity_validate BEFORE INSERT OR UPDATE ON public.real_estate_visits FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_activity();
DROP TRIGGER IF EXISTS activity_audit ON public.real_estate_visits;
CREATE TRIGGER activity_audit AFTER INSERT OR UPDATE ON public.real_estate_visits FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.audit_activity();
CREATE OR REPLACE FUNCTION public.save_real_estate_interest(_organization_id uuid,_id uuid,_expected_version bigint,_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.real_estate_interests; existing public.real_estate_interests;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) OR NOT public.has_org_role(_organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'REAL_ESTATE_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'REAL_ESTATE_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO saved FROM jsonb_populate_record(NULL::public.real_estate_interests,_values);
 saved.id:=_id; saved.organization_id:=_organization_id; saved.created_by:=auth.uid(); saved.updated_by:=auth.uid(); saved.version:=1; saved.created_at:=now(); saved.updated_at:=now();
 saved.notes:=nullif(btrim(saved.notes),'');
 IF _expected_version IS NULL THEN
  -- A leitura primeiro permite repetir uma criação confirmada sem revalidar uma data que passou.
  SELECT * INTO existing FROM public.real_estate_interests WHERE id=_id AND organization_id=_organization_id;
  IF existing.id IS NULL THEN INSERT INTO public.real_estate_interests SELECT saved.* ON CONFLICT(id) DO NOTHING RETURNING * INTO existing;
   IF existing.id IS NULL THEN SELECT * INTO existing FROM public.real_estate_interests WHERE id=_id AND organization_id=_organization_id; END IF;
  END IF;
  IF existing.id IS NULL OR (to_jsonb(existing)-ARRAY['version','created_by','updated_by','created_at','updated_at']) IS DISTINCT FROM (to_jsonb(saved)-ARRAY['version','created_by','updated_by','created_at','updated_at']) THEN RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
 ELSE
  UPDATE public.real_estate_interests SET property_id=saved.property_id,client_id=saved.client_id,purpose=saved.purpose,status=saved.status,responsible_user_id=saved.responsible_user_id,notes=saved.notes WHERE id=_id AND organization_id=_organization_id AND version=_expected_version RETURNING * INTO existing;
  IF existing.id IS NULL THEN RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN to_jsonb(existing);
END;
$$;
REVOKE ALL ON FUNCTION public.save_real_estate_interest(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_real_estate_interest(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_real_estate_visit(_organization_id uuid,_id uuid,_expected_version bigint,_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE saved public.real_estate_visits; existing public.real_estate_visits;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) OR NOT public.has_org_role(_organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'REAL_ESTATE_WRITE_DENIED' USING ERRCODE='42501'; END IF;
 IF _id IS NULL OR _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'REAL_ESTATE_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO saved FROM jsonb_populate_record(NULL::public.real_estate_visits,_values);
 saved.id:=_id; saved.organization_id:=_organization_id; saved.created_by:=auth.uid(); saved.updated_by:=auth.uid(); saved.version:=1; saved.created_at:=now(); saved.updated_at:=now();
 saved.notes:=nullif(btrim(saved.notes),'');
 saved.outcome:=nullif(btrim(saved.outcome),'');
 IF _expected_version IS NULL THEN
  -- A leitura primeiro permite repetir uma criação confirmada sem revalidar uma data que passou.
  SELECT * INTO existing FROM public.real_estate_visits WHERE id=_id AND organization_id=_organization_id;
  IF existing.id IS NULL THEN INSERT INTO public.real_estate_visits SELECT saved.* ON CONFLICT(id) DO NOTHING RETURNING * INTO existing;
   IF existing.id IS NULL THEN SELECT * INTO existing FROM public.real_estate_visits WHERE id=_id AND organization_id=_organization_id; END IF;
  END IF;
  IF existing.id IS NULL OR (to_jsonb(existing)-ARRAY['version','created_by','updated_by','created_at','updated_at']) IS DISTINCT FROM (to_jsonb(saved)-ARRAY['version','created_by','updated_by','created_at','updated_at']) THEN RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
 ELSE
  UPDATE public.real_estate_visits SET property_id=saved.property_id,interest_id=saved.interest_id,responsible_user_id=saved.responsible_user_id,starts_at=saved.starts_at,ends_at=saved.ends_at,status=saved.status,notes=saved.notes,outcome=saved.outcome WHERE id=_id AND organization_id=_organization_id AND version=_expected_version RETURNING * INTO existing;
  IF existing.id IS NULL THEN RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
 END IF;
 RETURN to_jsonb(existing);
END;
$$;
REVOKE ALL ON FUNCTION public.save_real_estate_visit(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_real_estate_visit(uuid,uuid,bigint,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_real_estate_activity(_organization_id uuid,_property_id uuid,_kind text,_status text DEFAULT NULL,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'REAL_ESTATE_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _kind NOT IN ('interests','visits') OR _kind IS NULL OR _page IS NULL OR _page<1 OR _page>100000 THEN RAISE EXCEPTION 'REAL_ESTATE_INVALID' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.real_estate_properties WHERE organization_id=_organization_id AND id=_property_id) THEN RAISE EXCEPTION 'REAL_ESTATE_PROPERTY_INVALID' USING ERRCODE='22023'; END IF;
 IF _kind='interests' THEN
  WITH filtered AS(SELECT i.*,c.name AS client_name,p.full_name AS responsible_name FROM public.real_estate_interests i LEFT JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id LEFT JOIN public.profiles p ON p.id=i.responsible_user_id WHERE i.organization_id=_organization_id AND i.property_id=_property_id AND (_status IS NULL OR i.status=_status)),
  page_rows AS(SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT 20 OFFSET ((_page-1)*20))
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY updated_at DESC,id) FROM page_rows r),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 ELSE
  WITH filtered AS(SELECT v.*,i.client_id,c.name AS client_name,p.full_name AS responsible_name FROM public.real_estate_visits v JOIN public.real_estate_interests i ON i.organization_id=v.organization_id AND i.property_id=v.property_id AND i.id=v.interest_id LEFT JOIN public.clients c ON c.organization_id=i.organization_id AND c.id=i.client_id LEFT JOIN public.profiles p ON p.id=v.responsible_user_id WHERE v.organization_id=_organization_id AND v.property_id=_property_id AND (_status IS NULL OR v.status=_status)),
  page_rows AS(SELECT * FROM filtered ORDER BY starts_at DESC,id LIMIT 20 OFFSET ((_page-1)*20))
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY starts_at DESC,id) FROM page_rows r),'[]'::jsonb),'total',(SELECT count(*) FROM filtered)) INTO result;
 END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_real_estate_activity(uuid,uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_real_estate_activity(uuid,uuid,text,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
