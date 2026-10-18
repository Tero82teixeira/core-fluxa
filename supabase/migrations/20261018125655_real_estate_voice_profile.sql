-- FLUXA Imobiliária: perfil público opcional e busca de imóveis com orçamento.
-- Pré-requisito: vitrine pública já ativada. Não altera contratos, repasses ou contatos.
BEGIN;
CREATE TABLE IF NOT EXISTS fluxa_catalog_private.business_profiles (
 organization_id uuid PRIMARY KEY REFERENCES fluxa_catalog_private.storefronts(organization_id),
 agent_name text NOT NULL DEFAULT '' CHECK(length(agent_name)<=120),
 agent_creci text NOT NULL DEFAULT '' CHECK(length(agent_creci)<=40),
 company_creci text NOT NULL DEFAULT '' CHECK(length(company_creci)<=40),
 bio text NOT NULL DEFAULT '' CHECK(length(bio)<=500),
 logo_path text, agent_photo_path text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fluxa_catalog_private.business_profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS business_profiles_logo_idx ON fluxa_catalog_private.business_profiles(logo_path) WHERE logo_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_profiles_agent_idx ON fluxa_catalog_private.business_profiles(agent_photo_path) WHERE agent_photo_path IS NOT NULL;
REVOKE ALL ON fluxa_catalog_private.business_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON fluxa_catalog_private.business_profiles TO authenticated;
DROP POLICY IF EXISTS branding_read ON fluxa_catalog_private.business_profiles;
CREATE POLICY branding_read ON fluxa_catalog_private.business_profiles FOR SELECT TO authenticated USING(fluxa_catalog_private.staff_access(organization_id));
DROP POLICY IF EXISTS branding_insert ON fluxa_catalog_private.business_profiles;
CREATE POLICY branding_insert ON fluxa_catalog_private.business_profiles FOR INSERT TO authenticated WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true));
DROP POLICY IF EXISTS branding_update ON fluxa_catalog_private.business_profiles;
CREATE POLICY branding_update ON fluxa_catalog_private.business_profiles FOR UPDATE TO authenticated USING(fluxa_catalog_private.staff_access(organization_id,true)) WITH CHECK(fluxa_catalog_private.staff_access(organization_id,true));

CREATE OR REPLACE FUNCTION fluxa_catalog_private.branding_staff_access(_path text,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF _path IS NULL OR _path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' THEN RETURN false; END IF;
 RETURN fluxa_catalog_private.staff_access(split_part(_path,'/',1)::uuid,_write);
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.branding_staff_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.branding_staff_access(text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION fluxa_catalog_private.validate_business_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE image_path text;
BEGIN
 IF NOT fluxa_catalog_private.staff_access(NEW.organization_id,true) THEN RAISE EXCEPTION 'BRANDING_DENIED' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'BRANDING_INVALID' USING ERRCODE='22023'; END IF;
 IF NEW.agent_photo_path IS NOT NULL AND btrim(NEW.agent_name)='' THEN RAISE EXCEPTION 'BRANDING_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
 FOREACH image_path IN ARRAY ARRAY[NEW.logo_path,NEW.agent_photo_path] LOOP
  IF image_path IS NOT NULL AND (NOT fluxa_catalog_private.branding_staff_access(image_path,true) OR split_part(image_path,'/',1)<>NEW.organization_id::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='real-estate-branding' AND name=image_path)) THEN
   RAISE EXCEPTION 'BRANDING_PHOTO_INVALID' USING ERRCODE='22023';
  END IF;
 END LOOP;
 NEW.version:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.version+1 END;
 NEW.updated_at:=clock_timestamp();RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.validate_business_profile() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validate_business_profile ON fluxa_catalog_private.business_profiles;
CREATE TRIGGER validate_business_profile BEFORE INSERT OR UPDATE ON fluxa_catalog_private.business_profiles FOR EACH ROW EXECUTE FUNCTION fluxa_catalog_private.validate_business_profile();

-- Exceção intencional: anon recebe somente o perfil escolhido para uma vitrine ativa.
-- A tabela privada e os perfis pessoais de autenticação continuam inacessíveis.
CREATE OR REPLACE FUNCTION fluxa_catalog_private.public_business_profile(_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('agent_name',p.agent_name,'agent_creci',p.agent_creci,'company_creci',p.company_creci,'bio',p.bio,'logo_path',p.logo_path,'agent_photo_path',p.agent_photo_path)
 FROM fluxa_catalog_private.business_profiles p
 JOIN fluxa_catalog_private.storefronts s ON s.organization_id=p.organization_id AND s.is_enabled
 JOIN public.organizations o ON o.id=p.organization_id AND o.archived_at IS NULL
 JOIN public.organization_settings cfg ON cfg.organization_id=o.id
 WHERE s.token=_token AND cfg.business_segment='real_estate'
 AND (cfg.enabled_modules IS NULL OR cfg.enabled_modules='[]'::jsonb OR cfg.enabled_modules ? 'real_estate_workspace');
$$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.public_business_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.public_business_profile(uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.real_estate_public_profile(_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT fluxa_catalog_private.public_business_profile(_token); $$;
REVOKE ALL ON FUNCTION public.real_estate_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.real_estate_public_profile(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION fluxa_catalog_private.branding_public_access(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM fluxa_catalog_private.business_profiles p JOIN fluxa_catalog_private.storefronts s ON s.organization_id=p.organization_id WHERE (_path=p.logo_path OR _path=p.agent_photo_path) AND fluxa_catalog_private.public_business_profile(s.token) IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION fluxa_catalog_private.branding_public_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fluxa_catalog_private.branding_public_access(text) TO anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('real-estate-branding','real-estate-branding',false,5242880,ARRAY['image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=ARRAY['image/webp'];
DROP POLICY IF EXISTS branding_staff_read ON storage.objects;
CREATE POLICY branding_staff_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='real-estate-branding' AND fluxa_catalog_private.branding_staff_access(name));
DROP POLICY IF EXISTS branding_public_read ON storage.objects;
CREATE POLICY branding_public_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='real-estate-branding' AND fluxa_catalog_private.branding_public_access(name));
DROP POLICY IF EXISTS branding_upload ON storage.objects;
CREATE POLICY branding_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='real-estate-branding' AND fluxa_catalog_private.branding_staff_access(name,true));
DROP POLICY IF EXISTS branding_delete ON storage.objects;
CREATE POLICY branding_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='real-estate-branding' AND fluxa_catalog_private.branding_staff_access(name,true) AND NOT EXISTS(SELECT 1 FROM fluxa_catalog_private.business_profiles p WHERE name IN(p.logo_path,p.agent_photo_path)));

CREATE OR REPLACE FUNCTION public.real_estate_profile_manage(_organization_id uuid,_action text,_values jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE old_profile fluxa_catalog_private.business_profiles; current_profile fluxa_catalog_private.business_profiles; removed text[];
BEGIN
 IF NOT fluxa_catalog_private.staff_access(_organization_id) THEN RAISE EXCEPTION 'BRANDING_DENIED' USING ERRCODE='42501'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' OR _action IS NULL OR _action NOT IN('load','save') THEN RAISE EXCEPTION 'BRANDING_INVALID' USING ERRCODE='22023'; END IF;
 IF _action='save' THEN
  IF NOT fluxa_catalog_private.staff_access(_organization_id,true) THEN RAISE EXCEPTION 'BRANDING_DENIED' USING ERRCODE='42501'; END IF;
  -- Serializa também a primeira gravação e a conferência da versão.
  PERFORM 1 FROM fluxa_catalog_private.storefronts WHERE organization_id=_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANDING_STORE_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO old_profile FROM fluxa_catalog_private.business_profiles WHERE organization_id=_organization_id FOR UPDATE;
  IF (_values->>'version')::integer IS DISTINCT FROM coalesce(old_profile.version,0) THEN RAISE EXCEPTION 'BRANDING_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO fluxa_catalog_private.business_profiles(organization_id,agent_name,agent_creci,company_creci,bio,logo_path,agent_photo_path)
   VALUES(_organization_id,btrim(coalesce(_values->>'agent_name','')),btrim(coalesce(_values->>'agent_creci','')),btrim(coalesce(_values->>'company_creci','')),btrim(coalesce(_values->>'bio','')),nullif(_values->>'logo_path',''),nullif(_values->>'agent_photo_path',''))
   ON CONFLICT(organization_id) DO UPDATE SET agent_name=excluded.agent_name,agent_creci=excluded.agent_creci,company_creci=excluded.company_creci,bio=excluded.bio,logo_path=excluded.logo_path,agent_photo_path=excluded.agent_photo_path;
 END IF;
 SELECT * INTO current_profile FROM fluxa_catalog_private.business_profiles WHERE organization_id=_organization_id;
 SELECT array_agg(DISTINCT x) INTO removed FROM unnest(ARRAY[old_profile.logo_path,old_profile.agent_photo_path]) x WHERE x IS NOT NULL AND x IS DISTINCT FROM current_profile.logo_path AND x IS DISTINCT FROM current_profile.agent_photo_path;
 RETURN jsonb_build_object('profile',CASE WHEN current_profile.organization_id IS NULL THEN NULL ELSE to_jsonb(current_profile)-'organization_id' END,'removed_paths',coalesce(to_jsonb(removed),'[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.real_estate_profile_manage(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.real_estate_profile_manage(uuid,text,jsonb) TO authenticated;

-- Filtro sobre todo o cadastro autorizado, antes da paginação, com contagens coerentes.
CREATE OR REPLACE FUNCTION public.search_real_estate_properties(_organization_id uuid,_search text DEFAULT NULL,
 _type text DEFAULT NULL,_purpose text DEFAULT NULL,_status text DEFAULT NULL,_city text DEFAULT NULL,_page integer DEFAULT 1,_max_price numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; pattern text := '%' || replace(replace(replace(translate(lower(btrim(coalesce(_search,''))),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'\','\\'),'%','\%'),'_','\_') || '%';
BEGIN
 IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'REAL_ESTATE_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF _page IS NULL OR _page<1 OR _page>100000 OR length(coalesce(_search,''))>100 OR (_type IS NOT NULL AND _type NOT IN('casa','apartamento','terreno','comercial','rural','outro')) OR (_purpose IS NOT NULL AND _purpose NOT IN('venda','locacao','venda_locacao')) OR (_max_price IS NOT NULL AND (_max_price<=0 OR _max_price>=1000000000000 OR _max_price='NaN'::numeric OR _purpose IS NULL OR _purpose NOT IN('venda','locacao'))) THEN RAISE EXCEPTION 'REAL_ESTATE_INVALID' USING ERRCODE='22023'; END IF;
 WITH filtered AS (
  SELECT p.*,c.name AS owner_name,pr.full_name AS responsible_name
  FROM public.real_estate_properties p LEFT JOIN public.clients c ON c.organization_id=p.organization_id AND c.id=p.owner_client_id LEFT JOIN public.profiles pr ON pr.id=p.responsible_user_id
  WHERE p.organization_id=_organization_id
   AND (_type IS NULL OR p.property_type=_type) AND (_purpose IS NULL OR p.purpose=_purpose OR (_purpose IN('venda','locacao') AND p.purpose='venda_locacao'))
   AND (_status IS NULL OR p.status=_status) AND (_city IS NULL OR lower(p.city)=lower(btrim(_city)))
   AND (_max_price IS NULL OR CASE WHEN _purpose='locacao' THEN p.rent_price ELSE p.sale_price END<=_max_price)
   AND translate(lower(concat_ws(' ',p.code,p.title,p.city,p.district,p.street,c.name)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') LIKE pattern
 ), page_rows AS(SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT 20 OFFSET((_page-1)*20))
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY updated_at DESC,id) FROM page_rows r),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'available',(SELECT count(*) FROM filtered WHERE status='disponivel'),'reserved',(SELECT count(*) FROM filtered WHERE status='reservado')) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.search_real_estate_properties(uuid,text,text,text,text,text,integer,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_real_estate_properties(uuid,text,text,text,text,text,integer,numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
