-- Preferências internas por atendimento. Requer catálogo e fila já ativados.
BEGIN;
CREATE TABLE IF NOT EXISTS fluxa_inquiry_private.preferences (
 organization_id uuid NOT NULL,
 request_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('venda','locacao')),
 property_type text NOT NULL DEFAULT '' CHECK(property_type IN ('','casa','apartamento','terreno','comercial','rural','outro')),
 districts text[] NOT NULL DEFAULT '{}' CHECK(cardinality(districts)<=10 AND length(array_to_string(districts,','))<=809 AND array_position(districts,NULL) IS NULL),
 max_price numeric CHECK(max_price>0 AND max_price<1000000000000),
 bedrooms smallint CHECK(bedrooms BETWEEN 0 AND 99),
 parking smallint CHECK(parking BETWEEN 0 AND 99),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(organization_id,request_id),
 FOREIGN KEY(organization_id,request_id) REFERENCES fluxa_inquiry_private.requests(organization_id,id)
);
ALTER TABLE fluxa_inquiry_private.preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fluxa_inquiry_private.preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON fluxa_inquiry_private.preferences TO authenticated;
DROP POLICY IF EXISTS staff_read ON fluxa_inquiry_private.preferences;
CREATE POLICY staff_read ON fluxa_inquiry_private.preferences FOR SELECT TO authenticated USING(fluxa_catalog_private.staff_access(organization_id));
DROP POLICY IF EXISTS staff_insert ON fluxa_inquiry_private.preferences;
CREATE POLICY staff_insert ON fluxa_inquiry_private.preferences FOR INSERT TO authenticated WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true));
DROP POLICY IF EXISTS staff_update ON fluxa_inquiry_private.preferences;
CREATE POLICY staff_update ON fluxa_inquiry_private.preferences FOR UPDATE TO authenticated USING(fluxa_catalog_private.staff_access(organization_id,true)) WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true));
CREATE OR REPLACE FUNCTION fluxa_inquiry_private.normalize_district(value text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT translate(lower(btrim(coalesce(value,''))),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
$$;
REVOKE ALL ON FUNCTION fluxa_inquiry_private.normalize_district(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fluxa_inquiry_private.normalize_district(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.real_estate_preferences(_organization_id uuid,_action text,_request_id uuid,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE pref fluxa_inquiry_private.preferences; r record; store fluxa_catalog_private.storefronts;
 v jsonb; ds text[]; page integer; only_matches boolean; result jsonb; ids uuid[];
BEGIN
 IF auth.uid() IS NULL OR NOT fluxa_catalog_private.staff_access(_organization_id) THEN RAISE EXCEPTION 'PREFERENCES_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'PREFERENCES_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND id=_request_id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'PREFERENCES_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _action='save' THEN
  IF NOT fluxa_catalog_private.staff_access(_organization_id,true) THEN RAISE EXCEPTION 'PREFERENCES_WRITE_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM id FROM fluxa_inquiry_private.requests WHERE organization_id=_organization_id AND id=_request_id FOR UPDATE;
 END IF;
 SELECT * INTO pref FROM fluxa_inquiry_private.preferences WHERE organization_id=_organization_id AND request_id=_request_id;
 IF _action='save' THEN
  IF coalesce(pref.version,0) IS DISTINCT FROM (_values->>'version')::bigint THEN RAISE EXCEPTION 'PREFERENCES_CONFLICT' USING ERRCODE='40001'; END IF;
  v:=_values->'preferences';
  IF v IS NULL OR jsonb_typeof(v)<>'object' OR coalesce(v->>'purpose','') NOT IN ('venda','locacao') OR jsonb_typeof(v->'districts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PREFERENCES_INVALID' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(v->'districts')>10 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'districts') e WHERE jsonb_typeof(e)<>'string' OR length(btrim(e#>>'{}')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'PREFERENCES_INVALID' USING ERRCODE='22023'; END IF;
  SELECT coalesce(array_agg(d ORDER BY d),'{}') INTO ds FROM (SELECT min(btrim(value)) AS d FROM jsonb_array_elements_text(v->'districts') GROUP BY fluxa_inquiry_private.normalize_district(value)) x;
  IF coalesce(v->>'property_type','') NOT IN ('','casa','apartamento','terreno','comercial','rural','outro') OR (v->>'max_price')::numeric<=0 OR (v->>'max_price')::numeric>=1000000000000 OR coalesce(v->>'max_price','') IN ('NaN','Infinity','-Infinity') OR (v->>'bedrooms' IS NOT NULL AND (v->>'bedrooms')!~'^([0-9]|[1-9][0-9])$') OR (v->>'parking' IS NOT NULL AND (v->>'parking')!~'^([0-9]|[1-9][0-9])$') THEN RAISE EXCEPTION 'PREFERENCES_INVALID' USING ERRCODE='22023'; END IF;
  INSERT INTO fluxa_inquiry_private.preferences(organization_id,request_id,purpose,property_type,districts,max_price,bedrooms,parking)
   VALUES(_organization_id,_request_id,v->>'purpose',coalesce(v->>'property_type',''),ds,(v->>'max_price')::numeric,(v->>'bedrooms')::smallint,(v->>'parking')::smallint)
   ON CONFLICT(organization_id,request_id) DO UPDATE SET purpose=excluded.purpose,property_type=excluded.property_type,districts=excluded.districts,max_price=excluded.max_price,bedrooms=excluded.bedrooms,parking=excluded.parking,version=fluxa_inquiry_private.preferences.version+1
   RETURNING * INTO pref;
 ELSIF _action NOT IN ('load','matches','selection') THEN RAISE EXCEPTION 'PREFERENCES_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT * INTO store FROM fluxa_catalog_private.storefronts WHERE organization_id=_organization_id AND is_enabled;
 result:=jsonb_build_object('preferences',CASE WHEN pref.request_id IS NOT NULL THEN to_jsonb(pref)-'organization_id'-'request_id'-'version' ELSE NULL END,'version',coalesce(pref.version,0),'token',store.token,'items','[]'::jsonb,'total',0);
 IF _action IN ('load','save') THEN RETURN result; END IF;
 IF _action='selection' THEN
  IF jsonb_typeof(_values->'ids') IS DISTINCT FROM 'array' OR jsonb_array_length(_values->'ids') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'PREFERENCES_SELECTION_INVALID' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT value::uuid) INTO ids FROM jsonb_array_elements_text(_values->'ids');
  IF store.token IS NULL OR cardinality(ids)<>(SELECT count(*) FROM fluxa_catalog_private.listings l WHERE l.organization_id=_organization_id AND l.id=ANY(ids) AND fluxa_catalog_private.is_public_listing(l.id)) THEN RAISE EXCEPTION 'PREFERENCES_SELECTION_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  RETURN result||jsonb_build_object('ids',to_jsonb(ids));
 END IF;
 IF pref.request_id IS NULL THEN RAISE EXCEPTION 'PREFERENCES_REQUIRED' USING ERRCODE='22023'; END IF;
 page:=coalesce((_values->>'page')::integer,1);only_matches:=coalesce((_values->>'only_matches')::boolean,true);
 IF page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'PREFERENCES_INVALID' USING ERRCODE='22023'; END IF;
 WITH candidates AS MATERIALIZED(
  SELECT l.id,p.code,array_remove(ARRAY[
   CASE WHEN p.purpose NOT IN (pref.purpose,'venda_locacao') THEN 'purpose' END,
   CASE WHEN pref.property_type<>'' AND pref.property_type<>p.property_type THEN 'property_type' END,
   CASE WHEN cardinality(pref.districts)>0 AND NOT EXISTS(SELECT 1 FROM unnest(pref.districts) d WHERE fluxa_inquiry_private.normalize_district(d)=fluxa_inquiry_private.normalize_district(p.district)) THEN 'districts' END,
   CASE WHEN pref.max_price IS NOT NULL THEN CASE WHEN (CASE WHEN pref.purpose='venda' THEN p.sale_price ELSE p.rent_price END) IS NULL THEN 'price_unknown' WHEN (CASE WHEN pref.purpose='venda' THEN p.sale_price ELSE p.rent_price END)>pref.max_price THEN 'max_price' END END,
   CASE WHEN pref.bedrooms IS NOT NULL THEN CASE WHEN l.bedrooms IS NULL THEN 'bedrooms_unknown' WHEN l.bedrooms<pref.bedrooms THEN 'bedrooms' END END,
   CASE WHEN pref.parking IS NOT NULL THEN CASE WHEN l.parking IS NULL THEN 'parking_unknown' WHEN l.parking<pref.parking THEN 'parking' END END
  ],NULL) AS issues
  FROM fluxa_catalog_private.listings l JOIN public.real_estate_properties p ON p.organization_id=l.organization_id AND p.id=l.property_id
  WHERE l.organization_id=_organization_id AND fluxa_catalog_private.is_public_listing(l.id)
 ),filtered AS MATERIALIZED(SELECT * FROM candidates WHERE NOT only_matches OR cardinality(issues)=0),
 paged AS(SELECT * FROM filtered ORDER BY cardinality(issues),code,id LIMIT 20 OFFSET (page-1)*20)
 SELECT result||jsonb_build_object('total',(SELECT count(*) FROM filtered),'items',coalesce((SELECT jsonb_agg(fluxa_catalog_private.listing_payload(id)||jsonb_build_object('issues',to_jsonb(issues)) ORDER BY cardinality(issues),code,id) FROM paged),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.real_estate_preferences(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_preferences(uuid,text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
