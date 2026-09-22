-- FLUXA Saúde: conciliação de pagamentos por lote.
-- Registra recebimentos do convênio e calcula enviado x recebido x glosado x pendente.

CREATE TABLE IF NOT EXISTS public.health_billing_batch_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.health_billing_batches(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  received_at date NOT NULL DEFAULT current_date,
  reference text,
  administrative_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS health_billing_batch_payments_batch_idx
  ON public.health_billing_batch_payments(organization_id, batch_id, received_at);

ALTER TABLE public.health_billing_batch_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.health_billing_batch_payments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_health_billing_batches(
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
    RAISE EXCEPTION 'HEALTH_BATCH_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_BATCH_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', batch.id,
        'insurer_id', batch.insurer_id,
        'insurer_name', insurer.name,
        'reference_period', batch.reference_period,
        'protocol_number', batch.protocol_number,
        'status', batch.status,
        'submitted_at', batch.submitted_at,
        'expected_payment_at', batch.expected_payment_at,
        'administrative_notes', batch.administrative_notes,
        'item_count', COALESCE(summary.item_count, 0),
        'total_amount', COALESCE(summary.total_amount, 0),
        'paid_amount', COALESCE(payments.received_amount, 0),
        'denied_amount', COALESCE(denials.net_denied_amount, 0),
        'pending_amount', GREATEST(
          0,
          COALESCE(summary.total_amount, 0)
          - COALESCE(payments.received_amount, 0)
          - COALESCE(denials.net_denied_amount, 0)
        ),
        'created_at', batch.created_at
      )
      ORDER BY batch.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_billing_batches batch
  JOIN public.health_insurers insurer
    ON insurer.id = batch.insurer_id
   AND insurer.organization_id = batch.organization_id
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS item_count,
      COALESCE(sum(billing.amount), 0)::numeric AS total_amount
    FROM public.health_billing_batch_items batch_item
    JOIN public.health_billing_items billing
      ON billing.id = batch_item.billing_item_id
     AND billing.organization_id = batch_item.organization_id
    WHERE batch_item.batch_id = batch.id
      AND batch_item.organization_id = batch.organization_id
  ) summary ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(payment.amount), 0)::numeric AS received_amount
    FROM public.health_billing_batch_payments payment
    WHERE payment.batch_id = batch.id
      AND payment.organization_id = batch.organization_id
  ) payments ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(denial.denied_amount - denial.recovered_amount), 0)::numeric AS net_denied_amount
    FROM public.health_billing_batch_items batch_item
    JOIN public.health_denials denial
      ON denial.billing_item_id = batch_item.billing_item_id
     AND denial.organization_id = batch_item.organization_id
     AND denial.status <> 'cancelada'
    WHERE batch_item.batch_id = batch.id
      AND batch_item.organization_id = batch.organization_id
  ) denials ON true
  WHERE batch.organization_id = _organization_id
    AND (
      NULLIF(trim(COALESCE(_search, '')), '') IS NULL
      OR insurer.name ILIKE '%' || trim(_search) || '%'
      OR batch.reference_period ILIKE '%' || trim(_search) || '%'
      OR COALESCE(batch.protocol_number, '') ILIKE '%' || trim(_search) || '%'
    );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_health_batch_payments(
  _organization_id uuid,
  _batch_id uuid
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
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.health_billing_batches
     WHERE id = _batch_id AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_BATCH_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', payment.id,
        'batch_id', payment.batch_id,
        'amount', payment.amount,
        'received_at', payment.received_at,
        'reference', payment.reference,
        'administrative_notes', payment.administrative_notes,
        'created_at', payment.created_at
      )
      ORDER BY payment.received_at DESC, payment.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM public.health_billing_batch_payments payment
  WHERE payment.organization_id = _organization_id
    AND payment.batch_id = _batch_id;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_health_batch_payment(
  _organization_id uuid,
  _batch_id uuid,
  _amount numeric,
  _received_at date DEFAULT current_date,
  _reference text DEFAULT NULL,
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE batch public.health_billing_batches;
DECLARE payment public.health_billing_batch_payments;
DECLARE batch_total numeric(14,2);
DECLARE current_received numeric(14,2);
DECLARE new_received numeric(14,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_AMOUNT_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT * INTO batch
    FROM public.health_billing_batches
   WHERE id = _batch_id
     AND organization_id = _organization_id
   FOR UPDATE;

  IF batch.id IS NULL OR batch.status IN ('rascunho','cancelado') THEN
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_BATCH_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(sum(billing.amount), 0)
    INTO batch_total
    FROM public.health_billing_batch_items batch_item
    JOIN public.health_billing_items billing
      ON billing.id = batch_item.billing_item_id
     AND billing.organization_id = batch_item.organization_id
   WHERE batch_item.batch_id = _batch_id
     AND batch_item.organization_id = _organization_id;

  SELECT COALESCE(sum(amount), 0)
    INTO current_received
    FROM public.health_billing_batch_payments
   WHERE batch_id = _batch_id
     AND organization_id = _organization_id;

  new_received := current_received + _amount;

  IF new_received > batch_total THEN
    RAISE EXCEPTION 'HEALTH_RECONCILIATION_OVERPAYMENT' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.health_billing_batch_payments(
    organization_id,
    batch_id,
    amount,
    received_at,
    reference,
    administrative_notes,
    created_by
  )
  VALUES (
    _organization_id,
    _batch_id,
    _amount,
    COALESCE(_received_at, current_date),
    NULLIF(trim(COALESCE(_reference, '')), ''),
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid()
  )
  RETURNING * INTO payment;

  UPDATE public.health_billing_batches
     SET status = CASE
           WHEN new_received >= batch_total THEN 'pago'
           WHEN new_received > 0 THEN 'parcial'
           ELSE status
         END,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = _batch_id
     AND organization_id = _organization_id;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.billing_batch.payment_recorded',
    'health_billing_batch_payment',
    payment.id,
    jsonb_build_object(
      'batch_id', _batch_id,
      'amount', payment.amount,
      'received_at', payment.received_at,
      'reference', payment.reference
    )
  );

  RETURN jsonb_build_object(
    'id', payment.id,
    'batch_id', payment.batch_id,
    'amount', payment.amount,
    'received_at', payment.received_at,
    'reference', payment.reference,
    'new_received_total', new_received,
    'batch_total', batch_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_batch_payments(uuid, uuid)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.record_health_batch_payment(uuid, uuid, numeric, date, text, text)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_batch_payments(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_health_batch_payment(uuid, uuid, numeric, date, text, text)
  TO authenticated;
