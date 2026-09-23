-- FLUXA Advocacia V1.1: dados jurídicos especializados por processo.
-- A tabela não é exposta diretamente ao navegador. Leitura e escrita passam
-- por RPCs que validam organização, papel, processo e módulo jurídico.

CREATE TABLE IF NOT EXISTS public.legal_case_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  cnj_number text,
  legal_area text,
  action_type text,
  court text,
  judicial_unit text,
  district text,
  state text,
  opposing_party text,
  case_side text,
  confidential boolean NOT NULL DEFAULT false,
  next_hearing_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT legal_case_profiles_org_process_unique UNIQUE (organization_id, process_id),
  CONSTRAINT legal_case_profiles_cnj_check CHECK (
    cnj_number IS NULL OR cnj_number ~ '^[0-9]{20}$'
  ),
  CONSTRAINT legal_case_profiles_area_check CHECK (
    legal_area IS NULL OR legal_area IN (
      'civil', 'trabalhista', 'previdenciario', 'tributario', 'empresarial',
      'familia', 'consumidor', 'criminal', 'administrativo', 'outro'
    )
  ),
  CONSTRAINT legal_case_profiles_side_check CHECK (
    case_side IS NULL OR case_side IN ('ativo', 'passivo', 'interessado')
  ),
  CONSTRAINT legal_case_profiles_state_check CHECK (
    state IS NULL OR state ~ '^[A-Z]{2}$'
  )
);

CREATE INDEX IF NOT EXISTS legal_case_profiles_org_hearing_idx
  ON public.legal_case_profiles(organization_id, next_hearing_at)
  WHERE next_hearing_at IS NOT NULL;

ALTER TABLE public.legal_case_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.legal_case_profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.legal_module_enabled(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_settings settings
     WHERE settings.organization_id = _organization_id
       AND settings.business_segment = 'legal'
       AND settings.enabled_modules ? 'legal_workspace'
  );
$function$;

REVOKE ALL ON FUNCTION public.legal_module_enabled(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_legal_case_profile(
  _organization_id uuid,
  _process_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','visualizador']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'LEGAL_CASE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.legal_module_enabled(_organization_id) THEN
    RAISE EXCEPTION 'LEGAL_CASE_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.processes process
     WHERE process.id = _process_id
       AND process.organization_id = _organization_id
       AND process.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'LEGAL_CASE_PROCESS_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT to_jsonb(profile)
    INTO result
    FROM public.legal_case_profiles profile
   WHERE profile.organization_id = _organization_id
     AND profile.process_id = _process_id;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_legal_case_profile(
  _organization_id uuid,
  _process_id uuid,
  _cnj_number text DEFAULT NULL,
  _legal_area text DEFAULT NULL,
  _action_type text DEFAULT NULL,
  _court text DEFAULT NULL,
  _judicial_unit text DEFAULT NULL,
  _district text DEFAULT NULL,
  _state text DEFAULT NULL,
  _opposing_party text DEFAULT NULL,
  _case_side text DEFAULT NULL,
  _confidential boolean DEFAULT false,
  _next_hearing_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  saved public.legal_case_profiles;
  clean_cnj text := NULLIF(regexp_replace(COALESCE(_cnj_number, ''), '\D', '', 'g'), '');
  clean_state text := NULLIF(upper(trim(COALESCE(_state, ''))), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'LEGAL_CASE_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.legal_module_enabled(_organization_id) THEN
    RAISE EXCEPTION 'LEGAL_CASE_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.processes process
     WHERE process.id = _process_id
       AND process.organization_id = _organization_id
       AND process.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'LEGAL_CASE_PROCESS_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  IF clean_cnj IS NOT NULL AND length(clean_cnj) <> 20 THEN
    RAISE EXCEPTION 'LEGAL_CASE_CNJ_INVALID' USING ERRCODE='22023';
  END IF;

  IF _legal_area IS NOT NULL AND _legal_area NOT IN (
    'civil', 'trabalhista', 'previdenciario', 'tributario', 'empresarial',
    'familia', 'consumidor', 'criminal', 'administrativo', 'outro'
  ) THEN
    RAISE EXCEPTION 'LEGAL_CASE_AREA_INVALID' USING ERRCODE='22023';
  END IF;

  IF _case_side IS NOT NULL AND _case_side NOT IN ('ativo', 'passivo', 'interessado') THEN
    RAISE EXCEPTION 'LEGAL_CASE_SIDE_INVALID' USING ERRCODE='22023';
  END IF;

  IF clean_state IS NOT NULL AND clean_state !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'LEGAL_CASE_STATE_INVALID' USING ERRCODE='22023';
  END IF;

  IF length(COALESCE(_action_type, '')) > 160
     OR length(COALESCE(_court, '')) > 160
     OR length(COALESCE(_judicial_unit, '')) > 160
     OR length(COALESCE(_district, '')) > 120
     OR length(COALESCE(_opposing_party, '')) > 180 THEN
    RAISE EXCEPTION 'LEGAL_CASE_FIELD_TOO_LONG' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.legal_case_profiles (
    organization_id, process_id, cnj_number, legal_area, action_type, court,
    judicial_unit, district, state, opposing_party, case_side, confidential,
    next_hearing_at, created_by, updated_by
  )
  VALUES (
    _organization_id, _process_id, clean_cnj, _legal_area,
    NULLIF(trim(COALESCE(_action_type, '')), ''),
    NULLIF(trim(COALESCE(_court, '')), ''),
    NULLIF(trim(COALESCE(_judicial_unit, '')), ''),
    NULLIF(trim(COALESCE(_district, '')), ''), clean_state,
    NULLIF(trim(COALESCE(_opposing_party, '')), ''), _case_side,
    COALESCE(_confidential, false), _next_hearing_at, auth.uid(), auth.uid()
  )
  ON CONFLICT (organization_id, process_id) DO UPDATE
    SET cnj_number = EXCLUDED.cnj_number,
        legal_area = EXCLUDED.legal_area,
        action_type = EXCLUDED.action_type,
        court = EXCLUDED.court,
        judicial_unit = EXCLUDED.judicial_unit,
        district = EXCLUDED.district,
        state = EXCLUDED.state,
        opposing_party = EXCLUDED.opposing_party,
        case_side = EXCLUDED.case_side,
        confidential = EXCLUDED.confidential,
        next_hearing_at = EXCLUDED.next_hearing_at,
        updated_at = now(),
        updated_by = auth.uid()
  RETURNING * INTO saved;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  )
  VALUES (
    _organization_id, auth.uid(), 'legal.case_profile.updated',
    'legal_case_profile', saved.id,
    jsonb_build_object('process_id', _process_id, 'cnj_number', clean_cnj)
  );

  RETURN to_jsonb(saved);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_legal_case_profile(uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_legal_case_profile(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_legal_case_profile(
  uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_legal_case_profile(
  uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, timestamptz
) TO authenticated;
