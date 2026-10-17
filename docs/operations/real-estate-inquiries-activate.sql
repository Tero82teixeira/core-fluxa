-- FLUXA: ativação conjunta da vitrine e do atendimento, preservando cadastros existentes.
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

-- Aplicar após os cadastros imobiliários e real-estate-catalog.sql no banco operacional.
BEGIN;
CREATE SCHEMA IF NOT EXISTS fluxa_inquiry_private;
REVOKE ALL ON SCHEMA fluxa_inquiry_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA fluxa_inquiry_private TO anon,authenticated;
CREATE TABLE IF NOT EXISTS fluxa_inquiry_private.requests (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 listing_id uuid NOT NULL, property_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 120),
 phone text NOT NULL CHECK(phone ~ '^55[1-9][0-9]{9,10}$'),
 purpose text NOT NULL CHECK(purpose IN ('venda','locacao')),
 kind text NOT NULL CHECK(kind IN ('informacao','visita')),
 preferred_day date, preferred_period text CHECK(preferred_period IN ('manha','tarde','noite')),
 message text NOT NULL DEFAULT '' CHECK(length(message)<=500),
 consent_version text NOT NULL DEFAULT '2026-10-contact-v1',
 status text NOT NULL DEFAULT 'novo' CHECK(status IN ('novo','em_contato','encerrado')),
 responsible_user_id uuid, interest_id uuid, visit_id uuid,
 internal_note text NOT NULL DEFAULT '' CHECK(length(internal_note)<=2000),
 version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
 FOREIGN KEY(organization_id,listing_id) REFERENCES fluxa_catalog_private.listings(organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_open_contact_idx ON fluxa_inquiry_private.requests(organization_id,property_id,phone,purpose) WHERE status<>'encerrado';
CREATE INDEX IF NOT EXISTS inquiry_org_queue_idx ON fluxa_inquiry_private.requests(organization_id,status,created_at DESC,id);
CREATE INDEX IF NOT EXISTS inquiry_org_phone_idx ON fluxa_inquiry_private.requests(organization_id,phone,created_at DESC);
CREATE INDEX IF NOT EXISTS inquiry_org_visit_idx ON fluxa_inquiry_private.requests(organization_id,visit_id);
CREATE TABLE IF NOT EXISTS fluxa_inquiry_private.confirmations (
 organization_id uuid NOT NULL REFERENCES public.organizations(id),visit_id uuid NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now(),confirmed_by uuid NOT NULL,
 PRIMARY KEY(organization_id,visit_id)
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['requests','confirmations'] LOOP
  EXECUTE format('ALTER TABLE fluxa_inquiry_private.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON fluxa_inquiry_private.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON fluxa_inquiry_private.%I TO authenticated',tab);
  EXECUTE format('DROP POLICY IF EXISTS staff_read ON fluxa_inquiry_private.%I',tab);
  EXECUTE format('CREATE POLICY staff_read ON fluxa_inquiry_private.%I FOR SELECT TO authenticated USING(fluxa_catalog_private.staff_access(organization_id))',tab);
  EXECUTE format('DROP POLICY IF EXISTS staff_insert ON fluxa_inquiry_private.%I',tab);
  EXECUTE format('CREATE POLICY staff_insert ON fluxa_inquiry_private.%I FOR INSERT TO authenticated WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true))',tab);
  EXECUTE format('DROP POLICY IF EXISTS staff_update ON fluxa_inquiry_private.%I',tab);
  EXECUTE format('CREATE POLICY staff_update ON fluxa_inquiry_private.%I FOR UPDATE TO authenticated USING(fluxa_catalog_private.staff_access(organization_id,true)) WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true))',tab);
 END LOOP;
END $$;
-- Escrita anônima intencional, limitada ao formulário público: nenhum SELECT é concedido.
-- Não usa auth.uid(): o visitante não tem conta. A organização vem do token e anúncio ativos.
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
 IF (SELECT count(*) FROM fluxa_inquiry_private.requests WHERE organization_id=org AND created_at>now()-interval '1 day')>=200
  OR (SELECT count(*) FROM fluxa_inquiry_private.requests WHERE organization_id=org AND requests.phone=v_phone AND created_at>now()-interval '1 day')>=5
 THEN RAISE EXCEPTION 'INQUIRY_LIMIT' USING ERRCODE='P0001'; END IF;
 INSERT INTO fluxa_inquiry_private.requests(id,organization_id,listing_id,property_id,name,phone,purpose,kind,preferred_day,preferred_period,message)
 VALUES(_request_id,org,_listing_id,pid,btrim(_values->>'name'),v_phone,wanted,_values->>'kind',day,period,btrim(coalesce(_values->>'message',''))) ON CONFLICT(id) DO NOTHING;
 RETURN '{"accepted":true}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION fluxa_inquiry_private.submit(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fluxa_inquiry_private.submit(uuid,uuid,uuid,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.real_estate_submit_inquiry(_token uuid,_listing_id uuid,_request_id uuid,_values jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT fluxa_inquiry_private.submit(_token,_listing_id,_request_id,_values); $$;
REVOKE ALL ON FUNCTION public.real_estate_submit_inquiry(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.real_estate_submit_inquiry(uuid,uuid,uuid,jsonb) TO anon,authenticated;

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
   PERFORM public.save_real_estate_interest(_organization_id,iid,NULL,jsonb_build_object('property_id',r.property_id,'client_id',client,'purpose',r.purpose,'status','novo','responsible_user_id',r.responsible_user_id,'notes','Origem: solicitação pela vitrine.'));
  END IF;
  UPDATE fluxa_inquiry_private.requests SET interest_id=iid,status='em_contato',version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() WHERE id=r.id;
 WHEN 'schedule' THEN
  IF r.id IS NULL OR r.interest_id IS NULL OR r.status='encerrado' THEN RAISE EXCEPTION 'INQUIRY_LINK_REQUIRED' USING ERRCODE='22023'; END IF;
  IF r.visit_id IS NOT NULL THEN RAISE EXCEPTION 'INQUIRY_ALREADY_SCHEDULED' USING ERRCODE='22023'; END IF;
  v_visit:=gen_random_uuid();
  PERFORM public.save_real_estate_visit(_organization_id,v_visit,NULL,jsonb_build_object('property_id',r.property_id,'interest_id',r.interest_id,'responsible_user_id',(_values->>'responsible_user_id')::uuid,'starts_at',_values->>'starts_at','ends_at',_values->>'ends_at','status','agendada','notes','Origem: solicitação pela vitrine.','outcome',NULL));
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
   FROM fluxa_inquiry_private.requests q JOIN public.real_estate_properties p ON p.organization_id=q.organization_id AND p.id=q.property_id
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
