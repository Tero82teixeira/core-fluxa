-- FLUXA Saúde: cadastro administrativo de pacientes.
-- Não armazena prontuário, diagnóstico, prescrição ou evolução clínica.
-- O paciente reaproveita o cadastro-base de clients e recebe apenas um perfil
-- administrativo específico da vertical Saúde.

CREATE TABLE IF NOT EXISTS public.health_patient_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  payer_type text NOT NULL DEFAULT 'particular',
  insurance_name text,
  member_number text,
  administrative_status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_patient_profiles_org_client_unique UNIQUE (organization_id, client_id),
  CONSTRAINT health_patient_profiles_payer_type_check
    CHECK (payer_type IN ('particular', 'convenio', 'pacote', 'outro')),
  CONSTRAINT health_patient_profiles_status_check
    CHECK (administrative_status IN ('ativo', 'inativo'))
);

CREATE INDEX IF NOT EXISTS health_patient_profiles_org_status_idx
  ON public.health_patient_profiles(organization_id, administrative_status);

ALTER TABLE public.health_patient_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.health_patient_profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.health_module_enabled(
  _organization_id uuid,
  _module text
)
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
       AND settings.business_segment = 'health'
       AND settings.enabled_modules ? _module
  );
$function$;

REVOKE ALL ON FUNCTION public.health_module_enabled(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_health_patients(
  _organization_id uuid,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_patients') THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', profile.id,
        'client_id', client.id,
        'name', client.name,
        'birth_date', client.birth_date,
        'phone', client.phone,
        'email', client.email,
        'payer_type', profile.payer_type,
        'insurance_name', profile.insurance_name,
        'member_number', profile.member_number,
        'administrative_status', profile.administrative_status,
        'created_at', profile.created_at
      )
      ORDER BY client.name
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_patient_profiles profile
  JOIN public.clients client
    ON client.id = profile.client_id
   AND client.organization_id = profile.organization_id
  WHERE profile.organization_id = _organization_id
    AND client.archived_at IS NULL
    AND (
      NULLIF(trim(COALESCE(_search, '')), '') IS NULL
      OR client.name ILIKE '%' || trim(_search) || '%'
      OR COALESCE(client.email, '') ILIKE '%' || trim(_search) || '%'
      OR COALESCE(client.phone, '') ILIKE '%' || trim(_search) || '%'
      OR COALESCE(profile.insurance_name, '') ILIKE '%' || trim(_search) || '%'
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_health_patient(
  _organization_id uuid,
  _name text,
  _birth_date date DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _payer_type text DEFAULT 'particular',
  _insurance_name text DEFAULT NULL,
  _member_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  patient_client public.clients;
  patient_profile public.health_patient_profiles;
  clean_name text := NULLIF(trim(_name), '');
  clean_phone text := NULLIF(regexp_replace(COALESCE(_phone, ''), '\D', '', 'g'), '');
  clean_email text := NULLIF(lower(trim(COALESCE(_email, ''))), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_patients') THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_name IS NULL THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_NAME_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF _payer_type NOT IN ('particular', 'convenio', 'pacote', 'outro') THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_PAYER_TYPE_INVALID' USING ERRCODE='22023';
  END IF;

  IF clean_phone IS NOT NULL AND length(clean_phone) NOT BETWEEN 10 AND 11 THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_PHONE_INVALID' USING ERRCODE='22023';
  END IF;

  IF _payer_type = 'convenio' AND NULLIF(trim(COALESCE(_insurance_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'HEALTH_PATIENT_INSURANCE_REQUIRED' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.clients (
    organization_id,
    person_type,
    name,
    birth_date,
    phone,
    email,
    status,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    'pf',
    clean_name,
    _birth_date,
    clean_phone,
    clean_email,
    'ativo',
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO patient_client;

  INSERT INTO public.health_patient_profiles (
    organization_id,
    client_id,
    payer_type,
    insurance_name,
    member_number,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    patient_client.id,
    _payer_type,
    NULLIF(trim(COALESCE(_insurance_name, '')), ''),
    NULLIF(trim(COALESCE(_member_number, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO patient_profile;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    metadata
  )
  VALUES (
    _organization_id,
    auth.uid(),
    'health.patient.created',
    'health_patient_profile',
    patient_profile.id,
    jsonb_build_object(
      'client_id', patient_client.id,
      'payer_type', patient_profile.payer_type
    )
  );

  RETURN jsonb_build_object(
    'id', patient_profile.id,
    'client_id', patient_client.id,
    'name', patient_client.name,
    'birth_date', patient_client.birth_date,
    'phone', patient_client.phone,
    'email', patient_client.email,
    'payer_type', patient_profile.payer_type,
    'insurance_name', patient_profile.insurance_name,
    'member_number', patient_profile.member_number,
    'administrative_status', patient_profile.administrative_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_patients(uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_patient(uuid, text, date, text, text, text, text, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_patients(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_patient(uuid, text, date, text, text, text, text, text)
  TO authenticated;
