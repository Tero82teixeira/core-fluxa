-- Organizações já existentes preservam sua navegação. Novas organizações que
-- selecionarem Saúde durante o cadastro recebem a experiência clínica focada.
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS focused_health_workspace boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.mark_new_health_workspace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.business_segment IS DISTINCT FROM 'health' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.business_segment IS NOT DISTINCT FROM NEW.business_segment THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organizations org
     WHERE org.id = NEW.organization_id
       AND org.onboarding_completed_at IS NULL
  ) THEN
    NEW.focused_health_workspace := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS organization_settings_new_health_workspace
  ON public.organization_settings;
CREATE TRIGGER organization_settings_new_health_workspace
  BEFORE INSERT OR UPDATE OF business_segment ON public.organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.mark_new_health_workspace();

REVOKE ALL ON FUNCTION public.mark_new_health_workspace() FROM PUBLIC, anon, authenticated;
