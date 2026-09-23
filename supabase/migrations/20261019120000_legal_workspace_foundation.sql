-- FLUXA Advocacia V1: ativa o painel jurídico para organizações do segmento
-- jurídico sem alterar ou duplicar os dados operacionais já existentes.

UPDATE public.organization_settings
   SET enabled_modules = enabled_modules || '["legal_workspace"]'::jsonb,
       updated_at = now()
 WHERE business_segment = 'legal'
   AND jsonb_typeof(enabled_modules) = 'array'
   AND NOT enabled_modules ? 'legal_workspace';
