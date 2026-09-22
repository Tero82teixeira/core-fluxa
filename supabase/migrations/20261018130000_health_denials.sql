-- FLUXA Saúde: Glosas e recuperação de valores.
-- Escopo administrativo/financeiro, sem prontuário clínico.

CREATE TABLE IF NOT EXISTS public.health_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  billing_item_id uuid NOT NULL REFERENCES public.health_billing_items(id) ON DELETE CASCADE,
  denial_code text,
  reason text NOT NULL,
  denied_amount numeric(14,2) NOT NULL CHECK (denied_amount > 0),
  recovered_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (recovered_amount >= 0),
  received_at date NOT NULL DEFAULT current_date,
  appeal_due_date date,
  appealed_at date,
  resolved_at date,
  status text NOT NULL DEFAULT 'aberta',
  administrative_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_denials_status_check CHECK (
    status IN ('aberta','em_recurso','recuperada','parcial','mantida','cancelada')
  ),
  CONSTRAINT health_denials_recovered_check CHECK (recovered_amount <= denied_amount)
);

CREATE INDEX IF NOT EXISTS health_denials_org_status_idx
  ON public.health_denials(organization_id, status);

CREATE INDEX IF NOT EXISTS health_denials_billing_idx
  ON public.health_denials(organization_id, billing_item_id);

ALTER TABLE public.health_denials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.health_denials FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_health_denials(
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
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_denials') THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', denial.id,
        'billing_item_id', denial.billing_item_id,
        'patient_name', client.name,
        'insurer_name', insurer.name,
        'service_label', billing.service_label,
        'billing_amount', billing.amount,
        'denial_code', denial.denial_code,
        'reason', denial.reason,
        'denied_amount', denial.denied_amount,
        'recovered_amount', denial.recovered_amount,
        'received_at', denial.received_at,
        'appeal_due_date', denial.appeal_due_date,
        'appealed_at', denial.appealed_at,
        'resolved_at', denial.resolved_at,
        'status', denial.status,
        'administrative_notes', denial.administrative_notes,
        'created_at', denial.created_at
      )
      ORDER BY denial.received_at DESC, denial.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_denials denial
  JOIN public.health_billing_items billing
    ON billing.id = denial.billing_item_id
   AND billing.organization_id = denial.organization_id
  JOIN public.health_patient_profiles profile
    ON profile.id = billing.patient_profile_id
   AND profile.organization_id = denial.organization_id
  JOIN public.clients client
    ON client.id = profile.client_id
   AND client.organization_id = denial.organization_id
  LEFT JOIN public.health_insurers insurer
    ON insurer.id = billing.insurer_id
   AND insurer.organization_id = denial.organization_id
  WHERE denial.organization_id = _organization_id
    AND (
      NULLIF(trim(COALESCE(_search, '')), '') IS NULL
      OR client.name ILIKE '%' || trim(_search) || '%'
      OR billing.service_label ILIKE '%' || trim(_search) || '%'
      OR COALESCE(insurer.name, '') ILIKE '%' || trim(_search) || '%'
      OR COALESCE(denial.denial_code, '') ILIKE '%' || trim(_search) || '%'
      OR denial.reason ILIKE '%' || trim(_search) || '%'
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_health_denial(
  _organization_id uuid,
  _billing_item_id uuid,
  _reason text,
  _denied_amount numeric,
  _denial_code text DEFAULT NULL,
  _received_at date DEFAULT current_date,
  _appeal_due_date date DEFAULT NULL,
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE denial public.health_denials;
DECLARE billing public.health_billing_items;
DECLARE clean_reason text := NULLIF(trim(_reason), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_denials') THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_reason IS NULL OR _denied_amount IS NULL OR _denied_amount <= 0 THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT * INTO billing
    FROM public.health_billing_items
   WHERE id = _billing_item_id
     AND organization_id = _organization_id;

  IF billing.id IS NULL THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_BILLING_INVALID' USING ERRCODE='22023';
  END IF;

  IF _denied_amount > billing.amount THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_AMOUNT_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.health_denials(
    organization_id,
    billing_item_id,
    denial_code,
    reason,
    denied_amount,
    received_at,
    appeal_due_date,
    administrative_notes,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    _billing_item_id,
    NULLIF(trim(COALESCE(_denial_code, '')), ''),
    clean_reason,
    _denied_amount,
    COALESCE(_received_at, current_date),
    _appeal_due_date,
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO denial;

  UPDATE public.health_billing_items
     SET status = 'glosado',
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = _billing_item_id
     AND organization_id = _organization_id
     AND status <> 'cancelado';

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.denial.created',
    'health_denial',
    denial.id,
    jsonb_build_object(
      'billing_item_id', denial.billing_item_id,
      'denied_amount', denial.denied_amount,
      'status', denial.status
    )
  );

  RETURN jsonb_build_object(
    'id', denial.id,
    'billing_item_id', denial.billing_item_id,
    'denial_code', denial.denial_code,
    'reason', denial.reason,
    'denied_amount', denial.denied_amount,
    'recovered_amount', denial.recovered_amount,
    'received_at', denial.received_at,
    'appeal_due_date', denial.appeal_due_date,
    'status', denial.status,
    'administrative_notes', denial.administrative_notes
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_health_denial(
  _organization_id uuid,
  _denial_id uuid,
  _status text,
  _recovered_amount numeric DEFAULT 0,
  _appealed_at date DEFAULT NULL,
  _resolved_at date DEFAULT NULL,
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE denial public.health_denials;
DECLARE previous_recovered numeric(14,2);
DECLARE recovery_delta numeric(14,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_denials') THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF _status NOT IN ('aberta','em_recurso','recuperada','parcial','mantida','cancelada') THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT * INTO denial
    FROM public.health_denials
   WHERE id = _denial_id
     AND organization_id = _organization_id
   FOR UPDATE;

  IF denial.id IS NULL THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_NOT_FOUND' USING ERRCODE='22023';
  END IF;

  IF _recovered_amount IS NULL OR _recovered_amount < 0 OR _recovered_amount > denial.denied_amount THEN
    RAISE EXCEPTION 'HEALTH_DENIAL_RECOVERED_INVALID' USING ERRCODE='22023';
  END IF;

  previous_recovered := denial.recovered_amount;
  recovery_delta := _recovered_amount - previous_recovered;

  UPDATE public.health_denials
     SET status = _status,
         recovered_amount = _recovered_amount,
         appealed_at = _appealed_at,
         resolved_at = _resolved_at,
         administrative_notes = COALESCE(NULLIF(trim(COALESCE(_administrative_notes, '')), ''), administrative_notes),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = _denial_id
     AND organization_id = _organization_id
  RETURNING * INTO denial;

  IF recovery_delta <> 0 THEN
    UPDATE public.health_billing_items
       SET paid_amount = GREATEST(0, LEAST(amount, paid_amount + recovery_delta)),
           status = CASE
             WHEN GREATEST(0, LEAST(amount, paid_amount + recovery_delta)) >= amount THEN 'pago'
             WHEN GREATEST(0, LEAST(amount, paid_amount + recovery_delta)) > 0 THEN 'parcial'
             WHEN status = 'pago' OR status = 'parcial' THEN 'glosado'
             ELSE status
           END,
           updated_at = now(),
           updated_by = auth.uid()
     WHERE id = denial.billing_item_id
       AND organization_id = _organization_id;
  END IF;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.denial.updated',
    'health_denial',
    denial.id,
    jsonb_build_object(
      'status', denial.status,
      'recovered_amount', denial.recovered_amount
    )
  );

  RETURN jsonb_build_object(
    'id', denial.id,
    'billing_item_id', denial.billing_item_id,
    'status', denial.status,
    'denied_amount', denial.denied_amount,
    'recovered_amount', denial.recovered_amount,
    'appealed_at', denial.appealed_at,
    'resolved_at', denial.resolved_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_denials(uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_denial(uuid, uuid, text, numeric, text, date, date, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.update_health_denial(uuid, uuid, text, numeric, date, date, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_denials(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_denial(uuid, uuid, text, numeric, text, date, date, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_health_denial(uuid, uuid, text, numeric, date, date, text)
  TO authenticated;
