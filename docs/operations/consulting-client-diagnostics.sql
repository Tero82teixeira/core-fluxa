-- Diagnóstico interno da Consultoria. Um registro atual por cliente; sem dados no portal.
CREATE TABLE IF NOT EXISTS public.consulting_client_diagnostics (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  focus text NOT NULL CHECK (focus IN ('sales','organization','service','finance','processes','other')),
  situation text NOT NULL CHECK (length(trim(situation)) BETWEEN 3 AND 2000),
  attempts text NOT NULL DEFAULT '' CHECK (length(attempts)<=2000),
  expected_result text NOT NULL CHECK (length(trim(expected_result)) BETWEEN 3 AND 2000),
  priority text NOT NULL CHECK (priority IN ('low','medium','high')),
  target_on date CHECK (target_on BETWEEN '2000-01-01' AND '2100-12-31'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL
);
CREATE INDEX IF NOT EXISTS consulting_diagnostics_org_idx ON public.consulting_client_diagnostics(organization_id,client_id);
ALTER TABLE public.consulting_client_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consulting_client_diagnostics FROM PUBLIC,anon,authenticated,service_role;

-- Helper interno: exige sessão, vínculo ativo, área e módulo Clientes.
CREATE OR REPLACE FUNCTION public.consulting_diagnostic_access(_organization_id uuid,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_org_role(_organization_id,
   CASE WHEN _write THEN ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
   ELSE ARRAY['superadmin','proprietario','administrador','gestor','operacional','visualizador']::public.app_role[] END)
 AND EXISTS(SELECT 1 FROM public.organization_settings s WHERE s.organization_id=_organization_id
   AND s.business_segment='consulting_services' AND (s.enabled_modules='[]'::jsonb OR s.enabled_modules ? 'clients'));
$$;
REVOKE ALL ON FUNCTION public.consulting_diagnostic_access(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_consulting_client_diagnostic(_organization_id uuid,_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.consulting_client_diagnostics;
BEGIN
 IF NOT public.consulting_diagnostic_access(_organization_id,false) THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.organization_id=_organization_id AND (NOT public.has_org_role(_organization_id,ARRAY['operacional']::public.app_role[])
   OR c.owner_id=auth.uid()
   OR EXISTS(SELECT 1 FROM public.processes p WHERE p.client_id=c.id AND p.organization_id=c.organization_id AND p.owner_id=auth.uid())
   OR EXISTS(SELECT 1 FROM public.tasks t WHERE t.client_id=c.id AND t.organization_id=c.organization_id AND t.assignee_id=auth.uid()))) THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_CLIENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO saved FROM public.consulting_client_diagnostics WHERE client_id=_client_id AND organization_id=_organization_id;
 RETURN CASE WHEN saved.client_id IS NULL THEN NULL ELSE to_jsonb(saved) END;
END; $$;

CREATE OR REPLACE FUNCTION public.save_consulting_client_diagnostic(_organization_id uuid,_client_id uuid,_values jsonb,_expected_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE saved public.consulting_client_diagnostics; old_revision integer; target date; key text;
BEGIN
 IF NOT public.consulting_diagnostic_access(_organization_id,true) THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 -- Serializa inclusive a primeira gravação; nenhum usuário altera cliente arquivado.
 PERFORM 1 FROM public.clients c WHERE c.id=_client_id AND c.organization_id=_organization_id AND c.archived_at IS NULL AND (NOT public.has_org_role(_organization_id,ARRAY['operacional']::public.app_role[])
   OR c.owner_id=auth.uid()
   OR EXISTS(SELECT 1 FROM public.processes p WHERE p.client_id=c.id AND p.organization_id=c.organization_id AND p.owner_id=auth.uid())
   OR EXISTS(SELECT 1 FROM public.tasks t WHERE t.client_id=c.id AND t.organization_id=c.organization_id AND t.assignee_id=auth.uid())) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_CLIENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF _values IS NULL OR jsonb_typeof(_values)<>'object' THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_INVALID' USING ERRCODE='22023'; END IF;
 FOREACH key IN ARRAY ARRAY['focus','situation','attempts','expected_result','priority','target_on'] LOOP
   IF coalesce(jsonb_typeof(_values->key),'')<>'string' THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF _values->>'focus' NOT IN ('sales','organization','service','finance','processes','other')
   OR _values->>'priority' NOT IN ('low','medium','high')
   OR length(trim(_values->>'situation')) NOT BETWEEN 3 AND 2000
   OR length(_values->>'situation')>2000 OR length(_values->>'attempts')>2000
   OR length(trim(_values->>'expected_result')) NOT BETWEEN 3 AND 2000 OR length(_values->>'expected_result')>2000
   OR (_values->>'target_on'<>'' AND _values->>'target_on' !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
 THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_INVALID' USING ERRCODE='22023'; END IF;
 BEGIN target:=nullif(_values->>'target_on','')::date;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_INVALID' USING ERRCODE='22023'; END;
 IF target IS NOT NULL AND target NOT BETWEEN '2000-01-01' AND '2100-12-31' THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_INVALID' USING ERRCODE='22023'; END IF;
 SELECT revision INTO old_revision FROM public.consulting_client_diagnostics WHERE client_id=_client_id AND organization_id=_organization_id FOR UPDATE;
 IF (FOUND AND _expected_revision IS DISTINCT FROM old_revision) OR (NOT FOUND AND _expected_revision IS NOT NULL) THEN RAISE EXCEPTION 'CONSULTING_DIAGNOSTIC_STALE' USING ERRCODE='40001'; END IF;
 INSERT INTO public.consulting_client_diagnostics(client_id,organization_id,focus,situation,attempts,expected_result,priority,target_on,created_by,updated_by)
 VALUES(_client_id,_organization_id,_values->>'focus',trim(_values->>'situation'),trim(_values->>'attempts'),trim(_values->>'expected_result'),_values->>'priority',target,auth.uid(),auth.uid())
 ON CONFLICT(client_id) DO UPDATE SET focus=EXCLUDED.focus,situation=EXCLUDED.situation,attempts=EXCLUDED.attempts,expected_result=EXCLUDED.expected_result,priority=EXCLUDED.priority,target_on=EXCLUDED.target_on,
 revision=public.consulting_client_diagnostics.revision+1,updated_at=now(),updated_by=auth.uid()
 RETURNING * INTO saved;
 -- Auditoria sem copiar as respostas internas para o histórico geral.
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
 VALUES(_organization_id,auth.uid(),'consulting.diagnostic.saved','client',_client_id,jsonb_build_object('revision',saved.revision));
 RETURN to_jsonb(saved);
END; $$;
REVOKE ALL ON FUNCTION public.read_consulting_client_diagnostic(uuid,uuid),public.save_consulting_client_diagnostic(uuid,uuid,jsonb,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.read_consulting_client_diagnostic(uuid,uuid),public.save_consulting_client_diagnostic(uuid,uuid,jsonb,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
