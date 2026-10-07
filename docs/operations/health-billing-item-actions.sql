-- Aplicar após as migrations de Saúde já existentes no projeto.
-- Recebimentos individuais são exclusivos de contas particulares.
BEGIN;
CREATE TABLE IF NOT EXISTS public.health_billing_item_payments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  billing_item_id uuid NOT NULL REFERENCES public.health_billing_items(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  received_at date NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_billing_item_payments_item_idx
  ON public.health_billing_item_payments(organization_id, billing_item_id);
ALTER TABLE public.health_billing_item_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_billing_item_payments FROM PUBLIC, anon, authenticated;

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
        'appointment_id', billing.appointment_id,
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

CREATE OR REPLACE FUNCTION public.apply_health_billing_item_action(
  _organization_id uuid, _item_id uuid, _action text, _request_id uuid,
  _amount numeric DEFAULT NULL, _received_at date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  billing public.health_billing_items;
  previous_payment public.health_billing_item_payments;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(_organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]) THEN
    RAISE EXCEPTION 'HEALTH_BILLING_WRITE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_BILLING_MODULE_DISABLED' USING ERRCODE = '42501';
  END IF;
  IF _action IS NULL OR _action NOT IN ('faturar','receber') OR _request_id IS NULL THEN
    RAISE EXCEPTION 'HEALTH_BILLING_ACTION_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO billing FROM public.health_billing_items
    WHERE id = _item_id AND organization_id = _organization_id FOR UPDATE;
  IF billing.id IS NULL THEN
    RAISE EXCEPTION 'HEALTH_BILLING_ITEM_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF billing.insurer_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.health_billing_batch_items
    WHERE billing_item_id = billing.id AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'HEALTH_BILLING_USE_BATCH' USING ERRCODE = '22023';
  END IF;

  IF _action = 'faturar' THEN
    -- Repetir a confirmação de faturamento não produz outro registro.
    IF billing.status = 'enviado' THEN RETURN to_jsonb(billing); END IF;
    IF billing.status <> 'rascunho' THEN
      RAISE EXCEPTION 'HEALTH_BILLING_STATUS_INVALID' USING ERRCODE = '22023';
    END IF;
    UPDATE public.health_billing_items SET status = 'enviado', billed_at = current_date,
      updated_at = now(), updated_by = auth.uid()
      WHERE id = billing.id AND organization_id = _organization_id RETURNING * INTO billing;
  ELSE
    IF _amount IS NULL OR _amount <= 0 OR _amount::text IN ('NaN','Infinity','-Infinity')
      OR _amount <> round(_amount, 2) OR _received_at IS NULL OR _received_at > current_date THEN
      RAISE EXCEPTION 'HEALTH_BILLING_PAYMENT_INVALID' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO previous_payment FROM public.health_billing_item_payments WHERE id = _request_id;
    IF previous_payment.id IS NOT NULL THEN
      IF previous_payment.organization_id <> _organization_id OR previous_payment.billing_item_id <> _item_id
        OR previous_payment.amount <> _amount OR previous_payment.received_at <> _received_at
        OR previous_payment.created_by <> auth.uid() THEN
        RAISE EXCEPTION 'HEALTH_BILLING_REQUEST_CONFLICT' USING ERRCODE = '22023';
      END IF;
      RETURN to_jsonb(billing);
    END IF;
    IF billing.status NOT IN ('enviado','parcial') OR _amount > billing.amount - billing.paid_amount THEN
      RAISE EXCEPTION 'HEALTH_BILLING_PAYMENT_EXCEEDS_BALANCE' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.health_billing_item_payments(id, organization_id, billing_item_id, amount, received_at, created_by)
      VALUES (_request_id, _organization_id, _item_id, _amount, _received_at, auth.uid());
    UPDATE public.health_billing_items SET paid_amount = paid_amount + _amount,
      status = CASE WHEN paid_amount + _amount = amount THEN 'pago' ELSE 'parcial' END,
      updated_at = now(), updated_by = auth.uid()
      WHERE id = billing.id AND organization_id = _organization_id RETURNING * INTO billing;
  END IF;
  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
    VALUES (_organization_id, auth.uid(), 'health.billing.' || _action, 'health_billing_item', billing.id,
      jsonb_build_object('request_id', _request_id, 'amount', _amount, 'received_at', _received_at,
        'status', billing.status, 'paid_amount', billing.paid_amount));
  RETURN to_jsonb(billing);
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_health_billing_item_action(uuid, uuid, text, uuid, numeric, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_health_billing_item_action(uuid, uuid, text, uuid, numeric, date)
  TO authenticated;
REVOKE ALL ON FUNCTION public.list_health_billing_items(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_health_billing_items(uuid, text) TO authenticated;
COMMIT;
