-- Prazos informados pela equipe. Datas são civis; o sistema não calcula prazos legais.
CREATE TABLE IF NOT EXISTS public.legal_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'concluido', 'cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS legal_deadlines_org_due_idx
  ON public.legal_deadlines(organization_id, due_date) WHERE status = 'aberto';
CREATE INDEX IF NOT EXISTS legal_deadlines_process_idx
  ON public.legal_deadlines(organization_id, process_id);

ALTER TABLE public.legal_deadlines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.legal_deadlines FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_legal_deadlines(
  _organization_id uuid,
  _process_id uuid DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional','visualizador']::public.app_role[]
  ) OR NOT public.legal_module_enabled(_organization_id) THEN
    RAISE EXCEPTION 'LEGAL_DEADLINE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _process_id IS NULL AND (_from IS NULL OR _to IS NULL OR _to <= _from OR _to > _from + 62) THEN
    RAISE EXCEPTION 'LEGAL_DEADLINE_RANGE_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(jsonb_agg(
    to_jsonb(d) || jsonb_build_object(
      'process_code', p.code, 'process_title', p.title,
      'client_name', c.name, 'confidential', COALESCE(profile.confidential, false)
    ) ORDER BY d.due_date, d.created_at
  ), '[]'::jsonb) INTO result
  FROM public.legal_deadlines d
  JOIN public.processes p ON p.id = d.process_id AND p.organization_id = d.organization_id
  JOIN public.clients c ON c.id = p.client_id AND c.organization_id = d.organization_id
  LEFT JOIN public.legal_case_profiles profile
    ON profile.process_id = p.id AND profile.organization_id = d.organization_id
  WHERE d.organization_id = _organization_id AND p.archived_at IS NULL
    AND (_process_id IS NULL OR d.process_id = _process_id)
    AND (_from IS NULL OR d.due_date >= _from)
    AND (_to IS NULL OR d.due_date < _to)
    AND (_process_id IS NOT NULL OR d.status = 'aberto');
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_legal_deadline(
  _organization_id uuid,
  _process_id uuid,
  _title text,
  _due_date date,
  _status text DEFAULT 'aberto',
  _deadline_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE saved public.legal_deadlines;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','operacional']::public.app_role[]
  ) OR NOT public.legal_module_enabled(_organization_id) THEN
    RAISE EXCEPTION 'LEGAL_DEADLINE_WRITE_DENIED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.processes p
    WHERE p.id = _process_id AND p.organization_id = _organization_id AND p.archived_at IS NULL) THEN
    RAISE EXCEPTION 'LEGAL_DEADLINE_PROCESS_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF _title IS NULL OR length(trim(_title)) NOT BETWEEN 1 AND 160
     OR _due_date IS NULL OR _status IS NULL OR _status NOT IN ('aberto','concluido','cancelado') THEN
    RAISE EXCEPTION 'LEGAL_DEADLINE_INVALID' USING ERRCODE='22023';
  END IF;
  IF _deadline_id IS NULL THEN
    INSERT INTO public.legal_deadlines
      (organization_id, process_id, title, due_date, status, created_by, updated_by)
    VALUES (_organization_id, _process_id, trim(_title), _due_date, _status, auth.uid(), auth.uid())
    RETURNING * INTO saved;
  ELSE
    UPDATE public.legal_deadlines SET title = trim(_title), due_date = _due_date,
      status = _status, updated_at = now(), updated_by = auth.uid()
    WHERE id = _deadline_id AND organization_id = _organization_id AND process_id = _process_id
    RETURNING * INTO saved;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LEGAL_DEADLINE_NOT_FOUND' USING ERRCODE='P0002';
    END IF;
  END IF;
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (_organization_id, auth.uid(), 'legal.deadline.saved', 'legal_deadline', saved.id,
    jsonb_build_object('process_id', _process_id, 'status', saved.status));
  RETURN to_jsonb(saved);
END;
$function$;

REVOKE ALL ON FUNCTION public.list_legal_deadlines(uuid, uuid, date, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_legal_deadlines(uuid, uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.save_legal_deadline(uuid, uuid, text, date, text, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_legal_deadline(uuid, uuid, text, date, text, uuid) TO authenticated;
