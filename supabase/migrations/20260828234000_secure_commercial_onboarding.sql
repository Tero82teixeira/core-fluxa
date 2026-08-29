-- Corrige o onboarding após o endurecimento de organization_settings e impede
-- que clientes alterem diretamente campos comerciais de organizations.

REVOKE UPDATE ON public.organizations FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_organization_onboarding(
  _organization_id uuid,
  _step integer,
  _company jsonb DEFAULT NULL,
  _settings jsonb DEFAULT NULL,
  _complete boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  current_step integer;
  company_name text;
  company_legal_name text;
  company_document text;
  company_document_digits text;
  company_phone text;
  company_whatsapp text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario', 'administrador', 'superadmin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'ONBOARDING_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF _step NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'ONBOARDING_STEP_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT organization.onboarding_step
    INTO current_step
    FROM public.organizations organization
   WHERE organization.id = _organization_id
     AND organization.archived_at IS NULL
   FOR UPDATE;

  IF current_step IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING_ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF _complete THEN
    IF _step <> 3 OR current_step <> 3 THEN
      RAISE EXCEPTION 'ONBOARDING_STEP_OUT_OF_SEQUENCE' USING ERRCODE = '22023';
    END IF;

    UPDATE public.organizations
       SET onboarding_completed = true,
           onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
           onboarding_step = 3,
           updated_at = now()
     WHERE id = _organization_id;
  ELSE
    IF _step > least(current_step + 1, 3) THEN
      RAISE EXCEPTION 'ONBOARDING_STEP_OUT_OF_SEQUENCE' USING ERRCODE = '22023';
    END IF;

    IF _step = 1 THEN
      IF jsonb_typeof(_company) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'ONBOARDING_COMPANY_INVALID' USING ERRCODE = '22023';
      END IF;

      company_name := NULLIF(trim(_company->>'trade_name'), '');
      company_legal_name := COALESCE(NULLIF(trim(_company->>'legal_name'), ''), company_name);
      company_document := NULLIF(trim(_company->>'document'), '');
      company_document_digits := NULLIF(regexp_replace(COALESCE(company_document, ''), '\D', '', 'g'), '');
      company_phone := NULLIF(regexp_replace(COALESCE(_company->>'phone', ''), '\D', '', 'g'), '');
      company_whatsapp := NULLIF(regexp_replace(COALESCE(_company->>'whatsapp', ''), '\D', '', 'g'), '');

      IF company_name IS NULL THEN
        RAISE EXCEPTION 'ONBOARDING_TRADE_NAME_REQUIRED' USING ERRCODE = '22023';
      END IF;
      IF company_document_digits IS NOT NULL AND length(company_document_digits) NOT IN (11, 14) THEN
        RAISE EXCEPTION 'ONBOARDING_DOCUMENT_INVALID' USING ERRCODE = '22023';
      END IF;
      IF company_phone IS NOT NULL AND length(company_phone) NOT BETWEEN 10 AND 11 THEN
        RAISE EXCEPTION 'ONBOARDING_PHONE_INVALID' USING ERRCODE = '22023';
      END IF;
      IF company_whatsapp IS NOT NULL AND length(company_whatsapp) NOT BETWEEN 10 AND 11 THEN
        RAISE EXCEPTION 'ONBOARDING_WHATSAPP_INVALID' USING ERRCODE = '22023';
      END IF;

      UPDATE public.organizations
         SET trade_name = company_name,
             legal_name = company_legal_name,
             document = company_document,
             document_digits = company_document_digits,
             phone = company_phone,
             whatsapp = company_whatsapp,
             onboarding_step = 1,
             updated_at = now()
       WHERE id = _organization_id;

      INSERT INTO public.organization_settings(organization_id, portal_name, updated_by)
      VALUES (_organization_id, company_name, auth.uid())
      ON CONFLICT (organization_id) DO UPDATE
        SET portal_name = EXCLUDED.portal_name,
            updated_by = auth.uid(),
            updated_at = now();
    ELSIF _step = 2 THEN
      IF jsonb_typeof(_settings) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'ONBOARDING_SETTINGS_INVALID' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.organization_settings(organization_id, updated_by)
      VALUES (_organization_id, auth.uid())
      ON CONFLICT (organization_id) DO NOTHING;

      UPDATE public.organization_settings
         SET zip_code = NULLIF(trim(_settings->>'zip_code'), ''),
             street = NULLIF(trim(_settings->>'street'), ''),
             number = NULLIF(trim(_settings->>'number'), ''),
             district = NULLIF(trim(_settings->>'district'), ''),
             city = NULLIF(trim(_settings->>'city'), ''),
             state = NULLIF(upper(trim(_settings->>'state')), ''),
             updated_by = auth.uid(),
             updated_at = now()
       WHERE organization_id = _organization_id;

      UPDATE public.organizations
         SET onboarding_step = 2,
             updated_at = now()
       WHERE id = _organization_id;
    ELSE
      IF jsonb_typeof(_settings) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'ONBOARDING_SETTINGS_INVALID' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.organization_settings(organization_id, updated_by)
      VALUES (_organization_id, auth.uid())
      ON CONFLICT (organization_id) DO NOTHING;

      UPDATE public.organization_settings
         SET main_services = NULLIF(trim(_settings->>'main_services'), ''),
             clients_range = NULLIF(trim(_settings->>'clients_range'), ''),
             employees_range = NULLIF(trim(_settings->>'employees_range'), ''),
             updated_by = auth.uid(),
             updated_at = now()
       WHERE organization_id = _organization_id;

      UPDATE public.organizations
         SET onboarding_step = 3,
             updated_at = now()
       WHERE id = _organization_id;
    END IF;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'organization_id', organization.id,
      'onboarding_step', organization.onboarding_step,
      'onboarding_completed', organization.onboarding_completed,
      'onboarding_completed_at', organization.onboarding_completed_at
    )
      FROM public.organizations organization
     WHERE organization.id = _organization_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_organization_onboarding(uuid, integer, jsonb, jsonb, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_onboarding(uuid, integer, jsonb, jsonb, boolean)
  TO authenticated;
