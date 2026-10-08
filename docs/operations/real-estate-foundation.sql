-- FLUXA Imobiliária V1. Execução manual após a base de segmentos existente.
-- Não altera a área nem os módulos habilitados de nenhuma empresa.
BEGIN;
CREATE SCHEMA IF NOT EXISTS fluxa_real_estate_private;
REVOKE ALL ON SCHEMA fluxa_real_estate_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.real_estate_enabled(_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.has_org_role(_organization_id, ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento','financeiro','visualizador']::public.app_role[])
    AND EXISTS (
      SELECT 1 FROM public.organization_settings s
      WHERE s.organization_id = _organization_id AND s.business_segment = 'real_estate'
        AND (s.enabled_modules IS NULL OR s.enabled_modules = '[]'::jsonb
          OR s.enabled_modules ? 'real_estate_workspace')
    );
$$;
REVOKE ALL ON FUNCTION public.real_estate_enabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.real_estate_enabled(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.real_estate_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z0-9_-]{1,30}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  property_type text NOT NULL CHECK (property_type IN ('casa','apartamento','terreno','comercial','rural','outro')),
  purpose text NOT NULL CHECK (purpose IN ('venda','locacao','venda_locacao')),
  status text NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','reservado','vendido','alugado','inativo')),
  owner_client_id uuid NOT NULL,
  responsible_user_id uuid,
  zip_code text CHECK (zip_code IS NULL OR zip_code ~ '^[0-9]{8}$'),
  street text NOT NULL CHECK (length(btrim(street)) BETWEEN 1 AND 160),
  number text CHECK (length(number) <= 30),
  complement text CHECK (length(complement) <= 100),
  district text CHECK (length(district) <= 100),
  city text NOT NULL CHECK (length(btrim(city)) BETWEEN 1 AND 100),
  state text NOT NULL CHECK (state IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  sale_price numeric(14,2) CHECK (sale_price > 0 AND sale_price < 1000000000000),
  rent_price numeric(14,2) CHECK (rent_price > 0 AND rent_price < 1000000000000),
  area_m2 numeric(12,2) CHECK (area_m2 > 0 AND area_m2 < 10000000000),
  notes text CHECK (length(notes) <= 4000),
  version bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  FOREIGN KEY (organization_id, owner_client_id) REFERENCES public.clients(organization_id,id),
  FOREIGN KEY (organization_id, responsible_user_id) REFERENCES public.organization_members(organization_id,user_id),
  CHECK ((purpose = 'venda' AND sale_price IS NOT NULL AND rent_price IS NULL)
      OR (purpose = 'locacao' AND rent_price IS NOT NULL AND sale_price IS NULL)
      OR (purpose = 'venda_locacao' AND sale_price IS NOT NULL AND rent_price IS NOT NULL)),
  CHECK (status <> 'vendido' OR purpose IN ('venda','venda_locacao')),
  CHECK (status <> 'alugado' OR purpose IN ('locacao','venda_locacao'))
);
CREATE INDEX IF NOT EXISTS real_estate_properties_org_updated_idx ON public.real_estate_properties(organization_id,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS real_estate_properties_org_status_idx ON public.real_estate_properties(organization_id,status);
CREATE INDEX IF NOT EXISTS real_estate_properties_org_owner_idx ON public.real_estate_properties(organization_id,owner_client_id);
CREATE INDEX IF NOT EXISTS real_estate_properties_org_responsible_idx ON public.real_estate_properties(organization_id,responsible_user_id);
ALTER TABLE public.real_estate_properties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.real_estate_properties FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.real_estate_properties TO authenticated;
DROP POLICY IF EXISTS real_estate_properties_read ON public.real_estate_properties;
CREATE POLICY real_estate_properties_read ON public.real_estate_properties FOR SELECT TO authenticated
  USING (public.real_estate_enabled(organization_id));
DROP POLICY IF EXISTS real_estate_properties_insert ON public.real_estate_properties;
CREATE POLICY real_estate_properties_insert ON public.real_estate_properties FOR INSERT TO authenticated
  WITH CHECK (public.real_estate_enabled(organization_id)
    AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));
DROP POLICY IF EXISTS real_estate_properties_update ON public.real_estate_properties;
CREATE POLICY real_estate_properties_update ON public.real_estate_properties FOR UPDATE TO authenticated
  USING (public.real_estate_enabled(organization_id)
    AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]))
  WITH CHECK (public.real_estate_enabled(organization_id)
    AND public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]));

-- Validação roda como chamador e também protege escrita direta pela Data API.
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.validate_real_estate_property()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'REAL_ESTATE_IMMUTABLE' USING ERRCODE='22023';
    END IF;
    IF NEW.version <> OLD.version THEN RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
    NEW.version := OLD.version + 1;
  ELSE
    NEW.created_by := auth.uid(); NEW.created_at := now(); NEW.version := 1;
  END IF;
  NEW.updated_by := auth.uid(); NEW.updated_at := clock_timestamp();
  IF TG_OP = 'INSERT' OR NEW.owner_client_id IS DISTINCT FROM OLD.owner_client_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=NEW.owner_client_id
      AND c.organization_id=NEW.organization_id AND c.archived_at IS NULL) THEN
      RAISE EXCEPTION 'REAL_ESTATE_OWNER_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NEW.responsible_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m WHERE m.organization_id=NEW.organization_id
      AND m.user_id=NEW.responsible_user_id AND m.is_active
      AND m.role IN ('superadmin','proprietario','administrador','gestor','operacional')
  ) THEN RAISE EXCEPTION 'REAL_ESTATE_RESPONSIBLE_INVALID' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.validate_real_estate_property() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS real_estate_property_validate ON public.real_estate_properties;
CREATE TRIGGER real_estate_property_validate BEFORE INSERT OR UPDATE ON public.real_estate_properties
FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.validate_real_estate_property();

-- Apenas o trigger privado eleva privilégio para escrever o registro de auditoria.
CREATE OR REPLACE FUNCTION fluxa_real_estate_private.audit_real_estate_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_logs (organization_id,actor_id,action,entity,entity_id,metadata)
  VALUES (NEW.organization_id,auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'real_estate.property_created' ELSE 'real_estate.property_updated' END,
    'real_estate_property',NEW.id,jsonb_build_object('code',NEW.code,'status',NEW.status,'version',NEW.version));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fluxa_real_estate_private.audit_real_estate_property() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS real_estate_property_audit ON public.real_estate_properties;
CREATE TRIGGER real_estate_property_audit AFTER INSERT OR UPDATE ON public.real_estate_properties
FOR EACH ROW EXECUTE FUNCTION fluxa_real_estate_private.audit_real_estate_property();

CREATE OR REPLACE FUNCTION public.save_real_estate_property(_organization_id uuid,_id uuid,_expected_version bigint,_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved public.real_estate_properties; existing public.real_estate_properties;
BEGIN
  IF NOT public.real_estate_enabled(_organization_id) OR NOT public.has_org_role(_organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]) THEN
    RAISE EXCEPTION 'REAL_ESTATE_WRITE_DENIED' USING ERRCODE='42501';
  END IF;
  IF _id IS NULL OR _values IS NULL OR jsonb_typeof(_values) <> 'object' THEN
    RAISE EXCEPTION 'REAL_ESTATE_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO saved FROM jsonb_populate_record(NULL::public.real_estate_properties,_values);
  saved.id := _id; saved.organization_id := _organization_id;
  saved.code := upper(btrim(saved.code)); saved.title := btrim(saved.title);
  saved.city := btrim(saved.city); saved.street := btrim(saved.street); saved.state := upper(btrim(saved.state));
  saved.created_by := auth.uid(); saved.updated_by := auth.uid(); saved.created_at := now(); saved.updated_at := now(); saved.version := 1;
  IF _expected_version IS NULL THEN
    INSERT INTO public.real_estate_properties SELECT saved.* ON CONFLICT (id) DO NOTHING RETURNING * INTO existing;
    IF existing.id IS NULL THEN
      SELECT * INTO existing FROM public.real_estate_properties WHERE id=_id AND organization_id=_organization_id;
      IF existing.id IS NULL OR (to_jsonb(existing) - ARRAY['version','created_at','updated_at','created_by','updated_by'])
        IS DISTINCT FROM (to_jsonb(saved) - ARRAY['version','created_at','updated_at','created_by','updated_by']) THEN
        RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
    END IF;
  ELSE
    UPDATE public.real_estate_properties SET code=saved.code,title=saved.title,property_type=saved.property_type,
      purpose=saved.purpose,status=saved.status,owner_client_id=saved.owner_client_id,responsible_user_id=saved.responsible_user_id,
      zip_code=saved.zip_code,street=saved.street,number=saved.number,complement=saved.complement,district=saved.district,
      city=saved.city,state=saved.state,sale_price=saved.sale_price,rent_price=saved.rent_price,area_m2=saved.area_m2,notes=saved.notes
    WHERE id=_id AND organization_id=_organization_id AND version=_expected_version RETURNING * INTO existing;
    IF existing.id IS NULL THEN RAISE EXCEPTION 'REAL_ESTATE_CONFLICT' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN to_jsonb(existing);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_real_estate_properties(_organization_id uuid,_search text DEFAULT NULL,
  _type text DEFAULT NULL,_purpose text DEFAULT NULL,_status text DEFAULT NULL,_city text DEFAULT NULL,_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; pattern text := '%' || replace(replace(replace(btrim(coalesce(_search,'')),'\','\\'),'%','\%'),'_','\_') || '%';
BEGIN
  IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'REAL_ESTATE_READ_DENIED' USING ERRCODE='42501'; END IF;
  IF _page IS NULL OR _page < 1 OR _page > 100000 THEN RAISE EXCEPTION 'REAL_ESTATE_INVALID' USING ERRCODE='22023'; END IF;
  WITH filtered AS (
    SELECT p.*,c.name AS owner_name,pr.full_name AS responsible_name
    FROM public.real_estate_properties p
    LEFT JOIN public.clients c ON c.organization_id=p.organization_id AND c.id=p.owner_client_id
    LEFT JOIN public.profiles pr ON pr.id=p.responsible_user_id
    WHERE p.organization_id=_organization_id
      AND (_type IS NULL OR p.property_type=_type) AND (_purpose IS NULL OR p.purpose=_purpose OR (_purpose IN ('venda','locacao') AND p.purpose='venda_locacao'))
      AND (_status IS NULL OR p.status=_status)
      AND (_city IS NULL OR lower(p.city)=lower(btrim(_city)))
      AND (p.code ILIKE pattern OR p.title ILIKE pattern OR p.city ILIKE pattern OR p.street ILIKE pattern OR c.name ILIKE pattern)
  ), page_rows AS (SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT 20 OFFSET ((_page-1)*20))
  SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY updated_at DESC,id) FROM page_rows r),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),
    'available',(SELECT count(*) FROM filtered WHERE status='disponivel'),
    'reserved',(SELECT count(*) FROM filtered WHERE status='reservado')) INTO result;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.real_estate_form_options(_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT public.real_estate_enabled(_organization_id) THEN RAISE EXCEPTION 'REAL_ESTATE_READ_DENIED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'owners',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name),'[]'::jsonb)
      FROM public.clients c WHERE c.organization_id=_organization_id AND c.archived_at IS NULL),
    'responsibles',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.user_id,'name',COALESCE(p.full_name,m.role::text)) ORDER BY p.full_name),'[]'::jsonb)
      FROM public.organization_members m LEFT JOIN public.profiles p ON p.id=m.user_id
      WHERE m.organization_id=_organization_id AND m.is_active
        AND m.role IN ('superadmin','proprietario','administrador','gestor','operacional')),
    'cities',(SELECT COALESCE(jsonb_agg(city ORDER BY city),'[]'::jsonb) FROM
      (SELECT DISTINCT city FROM public.real_estate_properties WHERE organization_id=_organization_id) cities));
END;
$$;
REVOKE ALL ON FUNCTION public.save_real_estate_property(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_real_estate_properties(uuid,text,text,text,text,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.real_estate_form_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_real_estate_property(uuid,uuid,bigint,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_real_estate_properties(uuid,text,text,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.real_estate_form_options(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
