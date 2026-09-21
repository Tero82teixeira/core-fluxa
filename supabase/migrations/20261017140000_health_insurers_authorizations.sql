-- FLUXA Saúde: Convênios e Autorizações administrativas.
-- Escopo administrativo; não armazena conteúdo clínico.

CREATE TABLE IF NOT EXISTS public.health_insurers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  registration_code text,
  contact_phone text,
  contact_email text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_insurers_status_check CHECK (status IN ('ativo','inativo')),
  CONSTRAINT health_insurers_name_unique UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS health_insurers_org_status_idx
  ON public.health_insurers(organization_id, status);

CREATE TABLE IF NOT EXISTS public.health_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_profile_id uuid NOT NULL REFERENCES public.health_patient_profiles(id) ON DELETE CASCADE,
  insurer_id uuid REFERENCES public.health_insurers(id) ON DELETE SET NULL,
  authorization_number text,
  service_label text NOT NULL,
  requested_at date NOT NULL DEFAULT current_date,
  valid_until date,
  status text NOT NULL DEFAULT 'pendente',
  administrative_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_authorizations_status_check
    CHECK (status IN ('pendente','autorizado','negado','expirado','cancelado'))
);

CREATE INDEX IF NOT EXISTS health_authorizations_org_status_idx
  ON public.health_authorizations(organization_id, status);

CREATE INDEX IF NOT EXISTS health_authorizations_patient_idx
  ON public.health_authorizations(organization_id, patient_profile_id);

ALTER TABLE public.health_insurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_authorizations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.health_insurers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.health_authorizations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_health_insurers(
  _organization_id uuid,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_INSURER_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_insurance') THEN
    RAISE EXCEPTION 'HEALTH_INSURER_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', insurer.id,
        'name', insurer.name,
        'registration_code', insurer.registration_code,
        'contact_phone', insurer.contact_phone,
        'contact_email', insurer.contact_email,
        'status', insurer.status,
        'created_at', insurer.created_at
      )
      ORDER BY insurer.name
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_insurers insurer
  WHERE insurer.organization_id = _organization_id
    AND (
      NULLIF(trim(COALESCE(_search, '')), '') IS NULL
      OR insurer.name ILIKE '%' || trim(_search) || '%'
      OR COALESCE(insurer.registration_code, '') ILIKE '%' || trim(_search) || '%'
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_health_insurer(
  _organization_id uuid,
  _name text,
  _registration_code text DEFAULT NULL,
  _contact_phone text DEFAULT NULL,
  _contact_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE insurer public.health_insurers;
DECLARE clean_name text := NULLIF(trim(_name), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_INSURER_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_insurance') THEN
    RAISE EXCEPTION 'HEALTH_INSURER_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_name IS NULL THEN
    RAISE EXCEPTION 'HEALTH_INSURER_NAME_REQUIRED' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.health_insurers(
    organization_id,
    name,
    registration_code,
    contact_phone,
    contact_email,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    clean_name,
    NULLIF(trim(COALESCE(_registration_code, '')), ''),
    NULLIF(regexp_replace(COALESCE(_contact_phone, ''), '\D', '', 'g'), ''),
    NULLIF(lower(trim(COALESCE(_contact_email, ''))), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO insurer;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.insurer.created',
    'health_insurer',
    insurer.id,
    jsonb_build_object('name', insurer.name)
  );

  RETURN jsonb_build_object(
    'id', insurer.id,
    'name', insurer.name,
    'registration_code', insurer.registration_code,
    'contact_phone', insurer.contact_phone,
    'contact_email', insurer.contact_email,
    'status', insurer.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_health_authorizations(
  _organization_id uuid,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_authorizations') THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', authorization.id,
        'patient_profile_id', authorization.patient_profile_id,
        'patient_name', client.name,
        'insurer_id', authorization.insurer_id,
        'insurer_name', insurer.name,
        'authorization_number', authorization.authorization_number,
        'service_label', authorization.service_label,
        'requested_at', authorization.requested_at,
        'valid_until', authorization.valid_until,
        'status', authorization.status,
        'administrative_notes', authorization.administrative_notes,
        'created_at', authorization.created_at
      )
      ORDER BY authorization.requested_at DESC, authorization.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_authorizations authorization
  JOIN public.health_patient_profiles profile
    ON profile.id = authorization.patient_profile_id
   AND profile.organization_id = authorization.organization_id
  JOIN public.clients client
    ON client.id = profile.client_id
   AND client.organization_id = authorization.organization_id
  LEFT JOIN public.health_insurers insurer
    ON insurer.id = authorization.insurer_id
   AND insurer.organization_id = authorization.organization_id
  WHERE authorization.organization_id = _organization_id
    AND (
      NULLIF(trim(COALESCE(_search, '')), '') IS NULL
      OR client.name ILIKE '%' || trim(_search) || '%'
      OR COALESCE(authorization.authorization_number, '') ILIKE '%' || trim(_search) || '%'
      OR authorization.service_label ILIKE '%' || trim(_search) || '%'
      OR COALESCE(insurer.name, '') ILIKE '%' || trim(_search) || '%'
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_health_authorization(
  _organization_id uuid,
  _patient_profile_id uuid,
  _insurer_id uuid,
  _service_label text,
  _authorization_number text DEFAULT NULL,
  _requested_at date DEFAULT current_date,
  _valid_until date DEFAULT NULL,
  _status text DEFAULT 'pendente',
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE authorization public.health_authorizations;
DECLARE clean_service text := NULLIF(trim(_service_label), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','atendimento']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_authorizations') THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_service IS NULL THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_SERVICE_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF _status NOT IN ('pendente','autorizado','negado','expirado','cancelado') THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.health_patient_profiles
     WHERE id = _patient_profile_id
       AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_PATIENT_INVALID' USING ERRCODE='22023';
  END IF;

  IF _insurer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.health_insurers
     WHERE id = _insurer_id
       AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'HEALTH_AUTHORIZATION_INSURER_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.health_authorizations(
    organization_id,
    patient_profile_id,
    insurer_id,
    authorization_number,
    service_label,
    requested_at,
    valid_until,
    status,
    administrative_notes,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    _patient_profile_id,
    _insurer_id,
    NULLIF(trim(COALESCE(_authorization_number, '')), ''),
    clean_service,
    COALESCE(_requested_at, current_date),
    _valid_until,
    _status,
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO authorization;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.authorization.created',
    'health_authorization',
    authorization.id,
    jsonb_build_object(
      'patient_profile_id', authorization.patient_profile_id,
      'insurer_id', authorization.insurer_id,
      'status', authorization.status
    )
  );

  RETURN jsonb_build_object(
    'id', authorization.id,
    'patient_profile_id', authorization.patient_profile_id,
    'insurer_id', authorization.insurer_id,
    'authorization_number', authorization.authorization_number,
    'service_label', authorization.service_label,
    'requested_at', authorization.requested_at,
    'valid_until', authorization.valid_until,
    'status', authorization.status,
    'administrative_notes', authorization.administrative_notes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_insurers(uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_insurer(uuid, text, text, text, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_health_authorizations(uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_authorization(uuid, uuid, uuid, text, text, date, date, text, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_insurers(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_insurer(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_health_authorizations(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_authorization(uuid, uuid, uuid, text, text, date, date, text, text)
  TO authenticated;
