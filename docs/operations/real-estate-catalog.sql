-- FLUXA Imobiliária: anúncios públicos e fotos isolados dos cadastros internos.
BEGIN;
CREATE SCHEMA IF NOT EXISTS fluxa_catalog_private;
REVOKE ALL ON SCHEMA fluxa_catalog_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA fluxa_catalog_private TO authenticated,anon;

CREATE OR REPLACE FUNCTION fluxa_catalog_private.staff_access(_org uuid,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF to_regprocedure('public.real_estate_enabled(uuid)') IS NULL THEN RETURN false; END IF;
  RETURN public.real_estate_enabled(_org) AND (NOT _write OR public.has_org_role(_org,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.staff_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.staff_access(uuid,boolean) TO authenticated;

CREATE TABLE IF NOT EXISTS fluxa_catalog_private.storefronts (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  company_name text NOT NULL CHECK(length(btrim(company_name)) BETWEEN 1 AND 160),
  whatsapp text NOT NULL DEFAULT '' CHECK(whatsapp='' OR whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  is_enabled boolean NOT NULL DEFAULT false,
  CHECK(NOT is_enabled OR whatsapp<>''),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fluxa_catalog_private.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  property_id uuid NOT NULL,
  public_title text NOT NULL CHECK(length(btrim(public_title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),
  bedrooms smallint CHECK(bedrooms BETWEEN 0 AND 99),
  bathrooms smallint CHECK(bathrooms BETWEEN 0 AND 99),
  parking smallint CHECK(parking BETWEEN 0 AND 99),
  features text NOT NULL DEFAULT '' CHECK(length(features)<=1000),
  is_published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,property_id), UNIQUE(organization_id,id)
);
CREATE TABLE IF NOT EXISTS fluxa_catalog_private.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  path text NOT NULL UNIQUE,
  caption text NOT NULL DEFAULT '' CHECK(length(caption)<=120),
  position integer NOT NULL CHECK(position BETWEEN 0 AND 100000),
  FOREIGN KEY(organization_id,listing_id) REFERENCES fluxa_catalog_private.listings(organization_id,id),
  CHECK(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' AND split_part(path,'/',1)=listing_id::text)
);
CREATE INDEX IF NOT EXISTS catalog_listings_org_idx ON fluxa_catalog_private.listings(organization_id,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS catalog_photos_listing_idx ON fluxa_catalog_private.photos(listing_id,position,id);
ALTER TABLE fluxa_catalog_private.storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fluxa_catalog_private.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fluxa_catalog_private.photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fluxa_catalog_private.storefronts,fluxa_catalog_private.listings,fluxa_catalog_private.photos FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON fluxa_catalog_private.storefronts,fluxa_catalog_private.listings TO authenticated;
GRANT SELECT,INSERT,DELETE ON fluxa_catalog_private.photos TO authenticated;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['storefronts','listings','photos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS staff_read ON fluxa_catalog_private.%I',tab);
    EXECUTE format('CREATE POLICY staff_read ON fluxa_catalog_private.%I FOR SELECT TO authenticated USING(fluxa_catalog_private.staff_access(organization_id))',tab);
    EXECUTE format('DROP POLICY IF EXISTS staff_insert ON fluxa_catalog_private.%I',tab);
    EXECUTE format('CREATE POLICY staff_insert ON fluxa_catalog_private.%I FOR INSERT TO authenticated WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true))',tab);
  END LOOP;
END $$;
DROP POLICY IF EXISTS staff_update ON fluxa_catalog_private.storefronts;
CREATE POLICY staff_update ON fluxa_catalog_private.storefronts FOR UPDATE TO authenticated USING(fluxa_catalog_private.staff_access(organization_id,true)) WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true));
DROP POLICY IF EXISTS staff_update ON fluxa_catalog_private.listings;
CREATE POLICY staff_update ON fluxa_catalog_private.listings FOR UPDATE TO authenticated USING(fluxa_catalog_private.staff_access(organization_id,true)) WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true));
DROP POLICY IF EXISTS staff_delete ON fluxa_catalog_private.photos;
CREATE POLICY staff_delete ON fluxa_catalog_private.photos FOR DELETE TO authenticated USING(fluxa_catalog_private.staff_access(organization_id,true));

CREATE OR REPLACE FUNCTION fluxa_catalog_private.validate_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE available boolean;
BEGIN
  IF NOT fluxa_catalog_private.staff_access(NEW.organization_id,true) THEN RAISE EXCEPTION 'CATALOG_WRITE_DENIED' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.property_id<>OLD.property_id) THEN
    RAISE EXCEPTION 'CATALOG_IMMUTABLE' USING ERRCODE='22023'; END IF;
  SELECT p.status IN ('disponivel','reservado') INTO available FROM public.real_estate_properties p
    WHERE p.organization_id=NEW.organization_id AND p.id=NEW.property_id;
  IF available IS NULL THEN RAISE EXCEPTION 'CATALOG_PROPERTY_DENIED' USING ERRCODE='42501'; END IF;
  IF NEW.is_published THEN
    IF NOT available THEN RAISE EXCEPTION 'CATALOG_PROPERTY_UNAVAILABLE' USING ERRCODE='22023'; END IF;
    IF length(btrim(NEW.description))<10 OR NOT EXISTS(SELECT 1 FROM fluxa_catalog_private.photos WHERE listing_id=NEW.id)
      THEN RAISE EXCEPTION 'CATALOG_PHOTO_DESCRIPTION_REQUIRED' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS(SELECT 1 FROM fluxa_catalog_private.storefronts WHERE organization_id=NEW.organization_id AND is_enabled)
      THEN RAISE EXCEPTION 'CATALOG_STOREFRONT_DISABLED' USING ERRCODE='22023'; END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.validate_listing() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validate_listing ON fluxa_catalog_private.listings;
CREATE TRIGGER validate_listing BEFORE INSERT OR UPDATE ON fluxa_catalog_private.listings FOR EACH ROW EXECUTE FUNCTION fluxa_catalog_private.validate_listing();

CREATE OR REPLACE FUNCTION fluxa_catalog_private.validate_photo()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NOT fluxa_catalog_private.staff_access(NEW.organization_id,true) THEN RAISE EXCEPTION 'CATALOG_WRITE_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM id FROM fluxa_catalog_private.listings WHERE id=NEW.listing_id AND organization_id=NEW.organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOG_PROPERTY_DENIED' USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM fluxa_catalog_private.photos WHERE listing_id=NEW.listing_id)>=20 THEN RAISE EXCEPTION 'CATALOG_PHOTO_LIMIT' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='real-estate-photos' AND name=NEW.path) THEN RAISE EXCEPTION 'CATALOG_PHOTO_MISSING' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.validate_photo() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validate_photo ON fluxa_catalog_private.photos;
CREATE TRIGGER validate_photo BEFORE INSERT ON fluxa_catalog_private.photos FOR EACH ROW EXECUTE FUNCTION fluxa_catalog_private.validate_photo();

-- Exceção intencional para publicidade anônima: somente visibilidade booleana.
-- Nenhum acesso aos cadastros internos é concedido a anon.
CREATE OR REPLACE FUNCTION fluxa_catalog_private.is_public_listing(_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF to_regclass('public.real_estate_properties') IS NULL THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM fluxa_catalog_private.listings l
    JOIN fluxa_catalog_private.storefronts s ON s.organization_id=l.organization_id AND s.is_enabled
    JOIN public.organizations o ON o.id=l.organization_id AND o.archived_at IS NULL
    JOIN public.organization_settings cfg ON cfg.organization_id=o.id
    JOIN public.real_estate_properties p ON p.organization_id=l.organization_id AND p.id=l.property_id
    WHERE l.id=_id AND l.is_published AND p.status IN ('disponivel','reservado')
      AND cfg.business_segment='real_estate' AND (cfg.enabled_modules IS NULL OR cfg.enabled_modules='[]'::jsonb OR cfg.enabled_modules ? 'real_estate_workspace'));
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.is_public_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.is_public_listing(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION fluxa_catalog_private.staff_photo_access(_path text,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF _path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' OR split_part(_path,'/',1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM fluxa_catalog_private.listings l WHERE l.id=split_part(_path,'/',1)::uuid AND fluxa_catalog_private.staff_access(l.organization_id,_write));
END; $$;
CREATE OR REPLACE FUNCTION fluxa_catalog_private.public_photo_access(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM fluxa_catalog_private.photos p WHERE p.path=_path AND fluxa_catalog_private.is_public_listing(p.listing_id));
$$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.staff_photo_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.staff_photo_access(text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION fluxa_catalog_private.public_photo_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.public_photo_access(text) TO anon,authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('real-estate-photos','real-estate-photos',false,5242880,ARRAY['image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=ARRAY['image/webp'];
DROP POLICY IF EXISTS catalog_photo_staff_read ON storage.objects;
CREATE POLICY catalog_photo_staff_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='real-estate-photos' AND fluxa_catalog_private.staff_photo_access(name));
DROP POLICY IF EXISTS catalog_photo_public_read ON storage.objects;
CREATE POLICY catalog_photo_public_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='real-estate-photos' AND fluxa_catalog_private.public_photo_access(name));
DROP POLICY IF EXISTS catalog_photo_upload ON storage.objects;
CREATE POLICY catalog_photo_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='real-estate-photos' AND fluxa_catalog_private.staff_photo_access(name,true));
DROP POLICY IF EXISTS catalog_photo_delete ON storage.objects;
CREATE POLICY catalog_photo_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='real-estate-photos' AND fluxa_catalog_private.staff_photo_access(name,true));

-- Lista explícita de campos públicos. Sem proprietário, notas, endereço completo ou documentos.
CREATE OR REPLACE FUNCTION fluxa_catalog_private.listing_payload(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('id',l.id,'title',l.public_title,'description',l.description,
    'bedrooms',l.bedrooms,'bathrooms',l.bathrooms,'parking',l.parking,'features',l.features,
    'code',p.code,'property_type',p.property_type,'purpose',p.purpose,'sale_price',p.sale_price,
    'rent_price',p.rent_price,'area_m2',p.area_m2,'district',p.district,'city',p.city,'state',p.state,
    'photos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ph.id,'path',ph.path,'caption',ph.caption) ORDER BY ph.position,ph.id) FROM fluxa_catalog_private.photos ph WHERE ph.organization_id=l.organization_id AND ph.listing_id=l.id),'[]'::jsonb))
  INTO result FROM fluxa_catalog_private.listings l JOIN public.real_estate_properties p ON p.organization_id=l.organization_id AND p.id=l.property_id WHERE l.id=_id;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.listing_payload(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.listing_payload(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.real_estate_catalog_manage(_organization_id uuid,_action text,_property_id uuid DEFAULT NULL,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l fluxa_catalog_private.listings; store fluxa_catalog_private.storefronts; source jsonb; result jsonb; page integer; photo_path text;
BEGIN
  IF NOT fluxa_catalog_private.staff_access(_organization_id) THEN RAISE EXCEPTION 'CATALOG_READ_DENIED' USING ERRCODE='42501'; END IF;
  IF _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'CATALOG_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  IF _property_id IS NOT NULL THEN
    SELECT jsonb_build_object('id',p.id,'code',p.code,'title',p.title,'property_type',p.property_type,'purpose',p.purpose,'sale_price',p.sale_price,'rent_price',p.rent_price,'area_m2',p.area_m2,'district',p.district,'city',p.city,'state',p.state,'status',p.status)
      INTO source FROM public.real_estate_properties p WHERE p.id=_property_id AND p.organization_id=_organization_id;
    IF source IS NULL THEN RAISE EXCEPTION 'CATALOG_PROPERTY_DENIED' USING ERRCODE='42501'; END IF;
    SELECT * INTO l FROM fluxa_catalog_private.listings WHERE organization_id=_organization_id AND property_id=_property_id;
  END IF;
  IF _action<>'load' AND NOT fluxa_catalog_private.staff_access(_organization_id,true) THEN RAISE EXCEPTION 'CATALOG_WRITE_DENIED' USING ERRCODE='42501'; END IF;
  CASE _action
  WHEN 'save_store' THEN
    INSERT INTO fluxa_catalog_private.storefronts(organization_id,company_name,whatsapp,is_enabled)
    VALUES(_organization_id,btrim(_values->>'company_name'),coalesce(_values->>'whatsapp',''),coalesce((_values->>'is_enabled')::boolean,false))
    ON CONFLICT(organization_id) DO UPDATE SET company_name=excluded.company_name,whatsapp=excluded.whatsapp,is_enabled=excluded.is_enabled,updated_at=clock_timestamp();
  WHEN 'save_listing' THEN
    IF _property_id IS NULL THEN RAISE EXCEPTION 'CATALOG_INPUT_INVALID' USING ERRCODE='22023'; END IF;
    IF l.id IS NULL THEN
    INSERT INTO fluxa_catalog_private.listings(organization_id,property_id,public_title,description,bedrooms,bathrooms,parking,features,is_published)
    VALUES(_organization_id,_property_id,btrim(_values->>'title'),coalesce(_values->>'description',''),(_values->>'bedrooms')::smallint,(_values->>'bathrooms')::smallint,(_values->>'parking')::smallint,coalesce(_values->>'features',''),coalesce((_values->>'is_published')::boolean,false))
    ;
    ELSE
      UPDATE fluxa_catalog_private.listings SET public_title=btrim(_values->>'title'),description=coalesce(_values->>'description',''),bedrooms=(_values->>'bedrooms')::smallint,bathrooms=(_values->>'bathrooms')::smallint,parking=(_values->>'parking')::smallint,features=coalesce(_values->>'features',''),is_published=coalesce((_values->>'is_published')::boolean,false) WHERE id=l.id AND organization_id=_organization_id;
    END IF;
  WHEN 'add_photo' THEN
    IF l.id IS NULL THEN RAISE EXCEPTION 'CATALOG_DRAFT_REQUIRED' USING ERRCODE='22023'; END IF;
    INSERT INTO fluxa_catalog_private.photos(organization_id,listing_id,path,caption,position)
    VALUES(_organization_id,l.id,_values->>'path',coalesce(_values->>'caption',''),coalesce((SELECT max(position)+1 FROM fluxa_catalog_private.photos WHERE listing_id=l.id),0));
  WHEN 'remove_photo' THEN
    PERFORM id FROM fluxa_catalog_private.listings WHERE id=l.id AND organization_id=_organization_id FOR UPDATE;
    SELECT path INTO photo_path FROM fluxa_catalog_private.photos WHERE organization_id=_organization_id AND listing_id=l.id AND id=(_values->>'id')::uuid;
    IF photo_path IS NULL THEN RAISE EXCEPTION 'CATALOG_PHOTO_MISSING' USING ERRCODE='22023'; END IF;
    -- Evita deixar um anúncio publicado sem fotos.
    IF (SELECT count(*) FROM fluxa_catalog_private.photos WHERE listing_id=l.id)=1 THEN UPDATE fluxa_catalog_private.listings SET is_published=false WHERE id=l.id; END IF;
    DELETE FROM fluxa_catalog_private.photos WHERE organization_id=_organization_id AND listing_id=l.id AND path=photo_path;
  WHEN 'load' THEN NULL;
  ELSE RAISE EXCEPTION 'CATALOG_INPUT_INVALID' USING ERRCODE='22023';
  END CASE;
  SELECT * INTO store FROM fluxa_catalog_private.storefronts WHERE organization_id=_organization_id;
  IF _property_id IS NOT NULL THEN SELECT * INTO l FROM fluxa_catalog_private.listings WHERE organization_id=_organization_id AND property_id=_property_id; END IF;
  page:=coalesce((_values->>'page')::integer,1);
  IF page<1 OR page>100000 THEN RAISE EXCEPTION 'CATALOG_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('store',CASE WHEN store.organization_id IS NULL THEN NULL ELSE to_jsonb(store) END,'source',source,
    'listing',CASE WHEN l.id IS NULL THEN NULL ELSE fluxa_catalog_private.listing_payload(l.id)||jsonb_build_object('property_id',l.property_id,'is_published',l.is_published,'visible',fluxa_catalog_private.is_public_listing(l.id)) END,
    'items',coalesce((SELECT jsonb_agg(x.data ORDER BY x.updated_at DESC,x.id) FROM (SELECT t.id,t.updated_at,fluxa_catalog_private.listing_payload(t.id)||jsonb_build_object('property_id',t.property_id,'is_published',t.is_published,'visible',fluxa_catalog_private.is_public_listing(t.id)) AS data FROM fluxa_catalog_private.listings t WHERE t.organization_id=_organization_id ORDER BY t.updated_at DESC,t.id LIMIT 20 OFFSET (page-1)*20) x),'[]'::jsonb),
    'total',(SELECT count(*) FROM fluxa_catalog_private.listings WHERE organization_id=_organization_id),'removed_path',photo_path) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.real_estate_catalog_manage(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_catalog_manage(uuid,text,uuid,jsonb) TO authenticated;

-- Endpoint público autorizado: o token identifica a vitrine, mas só anúncios publicados são retornados.
CREATE OR REPLACE FUNCTION fluxa_catalog_private.read_catalog(_token uuid,_ids uuid[],_page integer,_purpose text,_type text,_max_price numeric,_search text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE store fluxa_catalog_private.storefronts; result jsonb;
BEGIN
  IF _page IS NULL OR _page<1 OR _page>100000 OR coalesce(cardinality(_ids),0)>20 OR length(coalesce(_search,''))>100
    OR (_purpose IS NOT NULL AND _purpose NOT IN ('venda','locacao'))
    OR (_type IS NOT NULL AND _type NOT IN ('casa','apartamento','terreno','comercial','rural','outro'))
    OR (_max_price IS NOT NULL AND (_max_price<=0 OR _max_price>=1000000000000)) THEN RAISE EXCEPTION 'CATALOG_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT s.* INTO store FROM fluxa_catalog_private.storefronts s
    JOIN public.organizations o ON o.id=s.organization_id AND o.archived_at IS NULL
    JOIN public.organization_settings cfg ON cfg.organization_id=o.id
    WHERE s.token=_token AND s.is_enabled AND cfg.business_segment='real_estate'
      AND (cfg.enabled_modules IS NULL OR cfg.enabled_modules='[]'::jsonb OR cfg.enabled_modules ? 'real_estate_workspace');
  IF store.organization_id IS NULL OR to_regclass('public.real_estate_properties') IS NULL THEN RETURN NULL; END IF;
  WITH filtered AS MATERIALIZED(
    SELECT l.id,l.updated_at FROM fluxa_catalog_private.listings l JOIN public.real_estate_properties p ON p.organization_id=l.organization_id AND p.id=l.property_id
    WHERE l.organization_id=store.organization_id AND l.is_published AND p.status IN ('disponivel','reservado')
      AND (_ids IS NULL OR l.id=ANY(_ids)) AND (_purpose IS NULL OR p.purpose IN (_purpose,'venda_locacao'))
      AND (_type IS NULL OR p.property_type=_type)
      AND (_max_price IS NULL OR CASE WHEN _purpose='locacao' THEN p.rent_price<=_max_price WHEN _purpose='venda' THEN p.sale_price<=_max_price ELSE (p.sale_price<=_max_price OR p.rent_price<=_max_price) END)
      AND (coalesce(btrim(_search),'')='' OR strpos(lower(concat_ws(' ',l.public_title,p.code,p.city,p.district)),lower(btrim(_search)))>0)
  ),paged AS(SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT 20 OFFSET (_page-1)*20)
  SELECT jsonb_build_object('company_name',store.company_name,'whatsapp',store.whatsapp,
    'items',coalesce((SELECT jsonb_agg(fluxa_catalog_private.listing_payload(id) ORDER BY updated_at DESC,id) FROM paged),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered)) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.read_catalog(uuid,uuid[],integer,text,text,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.read_catalog(uuid,uuid[],integer,text,text,numeric,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.real_estate_public_catalog(_token uuid,_ids uuid[] DEFAULT NULL,_page integer DEFAULT 1,_purpose text DEFAULT NULL,_type text DEFAULT NULL,_max_price numeric DEFAULT NULL,_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT fluxa_catalog_private.read_catalog(_token,_ids,_page,_purpose,_type,_max_price,_search);
$$;
REVOKE ALL ON FUNCTION public.real_estate_public_catalog(uuid,uuid[],integer,text,text,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.real_estate_public_catalog(uuid,uuid[],integer,text,text,numeric,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
