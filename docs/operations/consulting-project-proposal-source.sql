-- Referência persistente da proposta aceita; projetos anteriores permanecem sem origem.
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS source_commercial_proposal_id uuid
  REFERENCES public.commercial_proposals(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS processes_proposal_source_idx ON public.processes(organization_id,source_commercial_proposal_id)
  WHERE source_commercial_proposal_id IS NOT NULL;

-- Invoker: preserva as políticas de processos, clientes e propostas existentes.
CREATE OR REPLACE FUNCTION public.guard_consulting_project_proposal_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW.source_commercial_proposal_id IS DISTINCT FROM OLD.source_commercial_proposal_id
     OR (OLD.source_commercial_proposal_id IS NOT NULL AND
       (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.client_id IS DISTINCT FROM OLD.client_id)) THEN
     RAISE EXCEPTION 'CONSULTING_PROJECT_SOURCE_IMMUTABLE' USING ERRCODE='22023';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW.source_commercial_proposal_id IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT public.has_org_role(NEW.organization_id,ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[])
   OR NOT EXISTS(SELECT 1 FROM public.organization_settings s WHERE s.organization_id=NEW.organization_id AND s.business_segment='consulting_services'
     AND (s.enabled_modules='[]'::jsonb OR (s.enabled_modules ? 'processes' AND s.enabled_modules ? 'reports'))) THEN
   RAISE EXCEPTION 'CONSULTING_PROJECT_SOURCE_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.commercial_proposals p JOIN public.clients c ON c.id=coalesce(p.client_id,p.converted_client_id) AND c.organization_id=p.organization_id
   WHERE p.id=NEW.source_commercial_proposal_id AND p.organization_id=NEW.organization_id AND c.id=NEW.client_id
     AND p.status='accepted' AND p.archived_at IS NULL AND c.archived_at IS NULL) THEN
   RAISE EXCEPTION 'CONSULTING_PROJECT_SOURCE_INVALID' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_consulting_project_proposal_source() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS guard_consulting_project_proposal_source ON public.processes;
CREATE TRIGGER guard_consulting_project_proposal_source BEFORE INSERT OR UPDATE OF source_commercial_proposal_id,organization_id,client_id
  ON public.processes FOR EACH ROW EXECUTE FUNCTION public.guard_consulting_project_proposal_source();
NOTIFY pgrst, 'reload schema';
