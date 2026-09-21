-- FLUXA Saúde: Contas Médicas / faturamento administrativo.
-- Não armazena prontuário ou conteúdo clínico.

CREATE TABLE IF NOT EXISTS public.health_billing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_profile_id uuid NOT NULL REFERENCES public.health_patient_profiles(id) ON DELETE CASCADE,
  insurer_id uuid REFERENCES public.health_insurers(id) ON DELETE SET NULL,
  authorization_id uuid REFERENCES public.health_authorizations(id) ON DELETE SET NULL,
  service_label text NOT NULL,
  service_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  billed_at date,
  due_date date,
  status text NOT NULL DEFAULT 'rascunho',
  administrative_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_billing_status_check CHECK (
    status IN ('rascunho','enviado','parcial','pago','glosado','cancelado')
  ),
  CONSTRAINT health_billing_paid_not_above_amount CHECK (paid_amount <= amount)
);

CREATE INDEX IF NOT EXISTS health_billing_org_status_idx
  ON public.health_billing_items(organization_id, status);

CREATE INDEX IF NOT EXISTS health_billing_patient_idx
  ON public.health_billing_items(organization_id, patient_profile_id);

ALTER TABLE public.health_billing_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.health_billing_items FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_health_billing_items(
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
    RAISE EXCEPTION 'HEALTH_BILLING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_BILLING_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', billing.id,
        'patient_profile_id', billing.patient_profile_id,
        'patient_name', client.name,
        'insurer_id', billing.insurer_id,
        'insurer_name', insurer.name,
        'authorization_id', billing.authorization_id,
        'service_label', billing.service_label,
        'service_date', billing.service_date,
        'amount', billing.amount,
        'paid_amount', billing.paid_amount,
        'billed_at', billing.billed_at,
        'due_date', billing.due_date,
        'status', billing.status,
        'administrative_notes', billing.administrative_notes,
        'created_at', billing.created_at
      )
      ORDER BY billing.service_date DESC, billing.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_billing_items billing
  JOIN public.health_patient_profiles profile
    ON profile.id = billing.patient_profile_id
   AND profile.organization_id = billing.organization_id
  JOIN public.clients client
    ON client.id = profile.client_id
   AND client.organization_id = billing.organization_id
  LEFT JOIN public.health_insurers insurer
    ON insurer.id = billing.insurer_id
   AND insurer.organization_id = billing.organization_id
  WHERE billing.organization_id = _organization_id
    AND (
      NULLIF(trim(COALESCE(_search, '')), '') IS NULL
      OR client.name ILIKE '%' || trim(_search) || '%'
      OR billing.service_label ILIKE '%' || trim(_search) || '%'
      OR COALESCE(insurer.name, '') ILIKE '%' || trim(_search) || '%'
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_health_billing_item(
  _organization_id uuid,
  _patient_profile_id uuid,
  _insurer_id uuid,
  _authorization_id uuid,
  _service_label text,
  _service_date date,
  _amount numeric,
  _billed_at date DEFAULT NULL,
  _due_date date DEFAULT NULL,
  _status text DEFAULT 'rascunho',
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE billing public.health_billing_items;
DECLARE clean_service text := NULLIF(trim(_service_label), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_BILLING_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_BILLING_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_service IS NULL OR _service_date IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'HEALTH_BILLING_INVALID' USING ERRCODE='22023';
  END IF;

  IF _status NOT IN ('rascunho','enviado','parcial','pago','glosado','cancelado') THEN
    RAISE EXCEPTION 'HEALTH_BILLING_STATUS_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.health_patient_profiles
     WHERE id = _patient_profile_id
       AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'HEALTH_BILLING_PATIENT_INVALID' USING ERRCODE='22023';
  END IF;

  IF _insurer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.health_insurers
     WHERE id = _insurer_id
       AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'HEALTH_BILLING_INSURER_INVALID' USING ERRCODE='22023';
  END IF;

  IF _authorization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.health_authorizations
     WHERE id = _authorization_id
       AND organization_id = _organization_id
       AND patient_profile_id = _patient_profile_id
  ) THEN
    RAISE EXCEPTION 'HEALTH_BILLING_AUTHORIZATION_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.health_billing_items(
    organization_id,
    patient_profile_id,
    insurer_id,
    authorization_id,
    service_label,
    service_date,
    amount,
    billed_at,
    due_date,
    status,
    administrative_notes,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    _patient_profile_id,
    _insurer_id,
    _authorization_id,
    clean_service,
    _service_date,
    _amount,
    _billed_at,
    _due_date,
    _status,
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO billing;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.billing.created',
    'health_billing_item',
    billing.id,
    jsonb_build_object(
      'patient_profile_id', billing.patient_profile_id,
      'insurer_id', billing.insurer_id,
      'amount', billing.amount,
      'status', billing.status
    )
  );

  RETURN jsonb_build_object(
    'id', billing.id,
    'patient_profile_id', billing.patient_profile_id,
    'insurer_id', billing.insurer_id,
    'authorization_id', billing.authorization_id,
    'service_label', billing.service_label,
    'service_date', billing.service_date,
    'amount', billing.amount,
    'paid_amount', billing.paid_amount,
    'billed_at', billing.billed_at,
    'due_date', billing.due_date,
    'status', billing.status,
    'administrative_notes', billing.administrative_notes
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_billing_items(uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_billing_item(uuid, uuid, uuid, uuid, text, date, numeric, date, date, text, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_billing_items(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_billing_item(uuid, uuid, uuid, uuid, text, date, numeric, date, date, text, text)
  TO authenticated;
