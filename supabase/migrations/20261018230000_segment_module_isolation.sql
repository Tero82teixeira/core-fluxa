-- Isolamento de módulos verticais por segmento.
-- Impede que módulos de Saúde sejam habilitados para organizações de outros
-- segmentos, inclusive por chamadas diretas à função de configuração.

CREATE OR REPLACE FUNCTION public.organization_modules_are_valid(
  _segment text,
  _enabled_modules jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(_enabled_modules) IS DISTINCT FROM 'array' THEN false
    ELSE NOT EXISTS (
        SELECT 1
          FROM jsonb_array_elements(_enabled_modules) AS module(value)
         WHERE jsonb_typeof(module.value) <> 'string'
            OR CASE module.value #>> '{}'
                 WHEN 'clients' THEN false
                 WHEN 'processes' THEN false
                 WHEN 'documents' THEN false
                 WHEN 'tasks' THEN false
                 WHEN 'communication' THEN false
                 WHEN 'finance' THEN false
                 WHEN 'monitoring' THEN false
                 WHEN 'reports' THEN false
                 WHEN 'automations' THEN false
                 WHEN 'client_portal' THEN false
                 WHEN 'health_patients' THEN _segment IS DISTINCT FROM 'health'
                 WHEN 'health_appointments' THEN _segment IS DISTINCT FROM 'health'
                 WHEN 'health_insurance' THEN _segment IS DISTINCT FROM 'health'
                 WHEN 'health_authorizations' THEN _segment IS DISTINCT FROM 'health'
                 WHEN 'health_billing' THEN _segment IS DISTINCT FROM 'health'
                 WHEN 'health_denials' THEN _segment IS DISTINCT FROM 'health'
                 WHEN 'legal_workspace' THEN _segment IS DISTINCT FROM 'legal'
                 WHEN 'engineering_workspace' THEN _segment IS DISTINCT FROM 'engineering'
                 WHEN 'real_estate_workspace' THEN _segment IS DISTINCT FROM 'real_estate'
                 ELSE true
               END
      )
  END;
$function$;

REVOKE ALL ON FUNCTION public.organization_modules_are_valid(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.organization_modules_are_valid(text, jsonb)
  TO authenticated, service_role;

-- Remove somente módulos incompatíveis ou desconhecidos de configurações
-- antigas. Módulos do núcleo e dados existentes permanecem intactos.
UPDATE public.organization_settings AS settings
   SET enabled_modules = (
         SELECT COALESCE(jsonb_agg(module.value), '[]'::jsonb)
           FROM jsonb_array_elements(settings.enabled_modules) AS module(value)
          WHERE jsonb_typeof(module.value) = 'string'
            AND CASE module.value #>> '{}'
                  WHEN 'clients' THEN true
                  WHEN 'processes' THEN true
                  WHEN 'documents' THEN true
                  WHEN 'tasks' THEN true
                  WHEN 'communication' THEN true
                  WHEN 'finance' THEN true
                  WHEN 'monitoring' THEN true
                  WHEN 'reports' THEN true
                  WHEN 'automations' THEN true
                  WHEN 'client_portal' THEN true
                  WHEN 'health_patients' THEN settings.business_segment = 'health'
                  WHEN 'health_appointments' THEN settings.business_segment = 'health'
                  WHEN 'health_insurance' THEN settings.business_segment = 'health'
                  WHEN 'health_authorizations' THEN settings.business_segment = 'health'
                  WHEN 'health_billing' THEN settings.business_segment = 'health'
                  WHEN 'health_denials' THEN settings.business_segment = 'health'
                  WHEN 'legal_workspace' THEN settings.business_segment = 'legal'
                  WHEN 'engineering_workspace' THEN settings.business_segment = 'engineering'
                  WHEN 'real_estate_workspace' THEN settings.business_segment = 'real_estate'
                  ELSE false
                END
       ),
       updated_at = now()
 WHERE NOT public.organization_modules_are_valid(
   settings.business_segment,
   settings.enabled_modules
 );

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_segment_modules_check;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_segment_modules_check CHECK (
    public.organization_modules_are_valid(business_segment, enabled_modules)
  );

CREATE OR REPLACE FUNCTION public.update_organization_segment(
  _organization_id uuid,
  _segment text,
  _enabled_modules jsonb,
  _subtype text DEFAULT NULL
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

  IF NOT public.organization_modules_are_valid(_segment, _enabled_modules) THEN
    RAISE EXCEPTION 'SEGMENT_MODULES_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organization_settings(
    organization_id,
    business_segment,
    business_subtype,
    enabled_modules,
    updated_by
  )
  VALUES (
    _organization_id,
    _segment,
    NULLIF(trim(COALESCE(_subtype, '')), ''),
    _enabled_modules,
    auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET business_segment = EXCLUDED.business_segment,
        business_subtype = EXCLUDED.business_subtype,
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
      'business_subtype', NULLIF(trim(COALESCE(_subtype, '')), ''),
      'enabled_modules', _enabled_modules
    )
  );

  RETURN jsonb_build_object(
    'organization_id', _organization_id,
    'business_segment', _segment,
    'business_subtype', NULLIF(trim(COALESCE(_subtype, '')), ''),
    'enabled_modules', _enabled_modules
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_organization_segment(uuid, text, jsonb, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_organization_segment(uuid, text, jsonb, text)
  TO authenticated;
