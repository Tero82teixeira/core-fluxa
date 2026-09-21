-- Fundação de segmentos e módulos por organização.
-- Mantém o núcleo do FLUXA independente de verticais e permite que o onboarding
-- personalize a experiência sem expor módulos de outros segmentos.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS business_segment text,
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_exploration_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_business_segment_check;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_business_segment_check CHECK (
    business_segment IS NULL OR business_segment IN (
      'legal',
      'accounting',
      'engineering',
      'health',
      'real_estate',
      'consulting_services',
      'other'
    )
  );

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_enabled_modules_check;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_enabled_modules_check CHECK (
    jsonb_typeof(enabled_modules) = 'array'
  );

CREATE OR REPLACE FUNCTION public.update_organization_segment(
  _organization_id uuid,
  _segment text,
  _enabled_modules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  allowed_segments constant text[] := ARRAY[
    'legal',
    'accounting',
    'engineering',
    'health',
    'real_estate',
    'consulting_services',
    'other'
  ];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario', 'administrador', 'superadmin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'SEGMENT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF _segment IS NULL OR NOT (_segment = ANY(allowed_segments)) THEN
    RAISE EXCEPTION 'SEGMENT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(_enabled_modules) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SEGMENT_MODULES_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organization_settings(
    organization_id,
    business_segment,
    enabled_modules,
    updated_by
  )
  VALUES (
    _organization_id,
    _segment,
    _enabled_modules,
    auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET business_segment = EXCLUDED.business_segment,
        enabled_modules = EXCLUDED.enabled_modules,
        updated_by = auth.uid(),
        updated_at = now();

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
    'organization.segment.updated',
    'organization_settings',
    _organization_id,
    jsonb_build_object(
      'business_segment', _segment,
      'enabled_modules', _enabled_modules
    )
  );

  RETURN jsonb_build_object(
    'organization_id', _organization_id,
    'business_segment', _segment,
    'enabled_modules', _enabled_modules
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_organization_segment(uuid, text, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_segment(uuid, text, jsonb)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.start_organization_exploration(
  _organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  selected_segment text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario', 'administrador', 'superadmin']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'ONBOARDING_EXPLORATION_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT business_segment
    INTO selected_segment
    FROM public.organization_settings
   WHERE organization_id = _organization_id
   FOR UPDATE;

  IF selected_segment IS NULL THEN
    RAISE EXCEPTION 'ONBOARDING_SEGMENT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organization_settings
     SET onboarding_exploration_enabled = true,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE organization_id = _organization_id;

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
    'organization.onboarding.exploration_started',
    'organization_settings',
    _organization_id,
    jsonb_build_object('business_segment', selected_segment)
  );

  RETURN jsonb_build_object(
    'organization_id', _organization_id,
    'onboarding_exploration_enabled', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.start_organization_exploration(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_organization_exploration(uuid)
  TO authenticated;
