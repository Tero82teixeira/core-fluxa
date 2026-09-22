-- FLUXA Saúde: lotes de faturamento e acompanhamento de envio.
-- Agrupa contas médicas por convênio sem armazenar conteúdo clínico.

CREATE TABLE IF NOT EXISTS public.health_billing_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  insurer_id uuid NOT NULL REFERENCES public.health_insurers(id) ON DELETE RESTRICT,
  reference_period text NOT NULL,
  protocol_number text,
  status text NOT NULL DEFAULT 'rascunho',
  submitted_at date,
  expected_payment_at date,
  administrative_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT health_billing_batches_status_check
    CHECK (status IN ('rascunho','enviado','processando','aceito','parcial','pago','rejeitado','cancelado'))
);

CREATE TABLE IF NOT EXISTS public.health_billing_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.health_billing_batches(id) ON DELETE CASCADE,
  billing_item_id uuid NOT NULL REFERENCES public.health_billing_items(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  CONSTRAINT health_billing_batch_items_unique UNIQUE (organization_id, billing_item_id)
);

CREATE INDEX IF NOT EXISTS health_billing_batches_org_status_idx
  ON public.health_billing_batches(organization_id, status);

CREATE INDEX IF NOT EXISTS health_billing_batches_insurer_idx
  ON public.health_billing_batches(organization_id, insurer_id);

CREATE INDEX IF NOT EXISTS health_billing_batch_items_batch_idx
  ON public.health_billing_batch_items(organization_id, batch_id);

ALTER TABLE public.health_billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_billing_batch_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.health_billing_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.health_billing_batch_items FROM PUBLIC, anon, authenticated;

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
        'paid_amount', COALESCE(summary.paid_amount, 0),
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
      COALESCE(sum(billing.amount), 0)::numeric AS total_amount,
      COALESCE(sum(billing.paid_amount), 0)::numeric AS paid_amount
    FROM public.health_billing_batch_items batch_item
    JOIN public.health_billing_items billing
      ON billing.id = batch_item.billing_item_id
     AND billing.organization_id = batch_item.organization_id
    WHERE batch_item.batch_id = batch.id
      AND batch_item.organization_id = batch.organization_id
  ) summary ON true
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

CREATE OR REPLACE FUNCTION public.create_health_billing_batch(
  _organization_id uuid,
  _insurer_id uuid,
  _reference_period text,
  _billing_item_ids jsonb,
  _expected_payment_at date DEFAULT NULL,
  _administrative_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE batch public.health_billing_batches;
DECLARE item_id uuid;
DECLARE inserted_count int := 0;
DECLARE clean_reference text := NULLIF(trim(_reference_period), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_BATCH_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_BATCH_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_reference IS NULL OR jsonb_typeof(_billing_item_ids) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_billing_item_ids) = 0 THEN
    RAISE EXCEPTION 'HEALTH_BATCH_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.health_insurers
     WHERE id = _insurer_id
       AND organization_id = _organization_id
       AND status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'HEALTH_BATCH_INSURER_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.health_billing_batches(
    organization_id,
    insurer_id,
    reference_period,
    expected_payment_at,
    administrative_notes,
    created_by,
    updated_by
  )
  VALUES (
    _organization_id,
    _insurer_id,
    clean_reference,
    _expected_payment_at,
    NULLIF(trim(COALESCE(_administrative_notes, '')), ''),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO batch;

  FOR item_id IN
    SELECT value::uuid FROM jsonb_array_elements_text(_billing_item_ids)
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.health_billing_items billing
       WHERE billing.id = item_id
         AND billing.organization_id = _organization_id
         AND billing.insurer_id = _insurer_id
         AND billing.status IN ('rascunho','enviado','parcial','glosado')
    ) THEN
      RAISE EXCEPTION 'HEALTH_BATCH_ITEM_INVALID' USING ERRCODE='22023';
    END IF;

    INSERT INTO public.health_billing_batch_items(
      organization_id,
      batch_id,
      billing_item_id,
      created_by
    )
    VALUES (
      _organization_id,
      batch.id,
      item_id,
      auth.uid()
    );

    inserted_count := inserted_count + 1;
  END LOOP;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.billing_batch.created',
    'health_billing_batch',
    batch.id,
    jsonb_build_object(
      'insurer_id', batch.insurer_id,
      'reference_period', batch.reference_period,
      'item_count', inserted_count
    )
  );

  RETURN jsonb_build_object(
    'id', batch.id,
    'insurer_id', batch.insurer_id,
    'reference_period', batch.reference_period,
    'status', batch.status,
    'item_count', inserted_count,
    'expected_payment_at', batch.expected_payment_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_health_billing_batch(
  _organization_id uuid,
  _batch_id uuid,
  _protocol_number text,
  _submitted_at date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE batch public.health_billing_batches;
DECLARE clean_protocol text := NULLIF(trim(_protocol_number), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(
    _organization_id,
    ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'HEALTH_BATCH_WRITE_DENIED' USING ERRCODE='42501';
  END IF;

  IF NOT public.health_module_enabled(_organization_id, 'health_billing') THEN
    RAISE EXCEPTION 'HEALTH_BATCH_MODULE_DISABLED' USING ERRCODE='42501';
  END IF;

  IF clean_protocol IS NULL THEN
    RAISE EXCEPTION 'HEALTH_BATCH_PROTOCOL_REQUIRED' USING ERRCODE='22023';
  END IF;

  SELECT * INTO batch
    FROM public.health_billing_batches
   WHERE id = _batch_id
     AND organization_id = _organization_id
   FOR UPDATE;

  IF batch.id IS NULL OR batch.status NOT IN ('rascunho','rejeitado') THEN
    RAISE EXCEPTION 'HEALTH_BATCH_NOT_SUBMITTABLE' USING ERRCODE='22023';
  END IF;

  UPDATE public.health_billing_batches
     SET status = 'enviado',
         protocol_number = clean_protocol,
         submitted_at = COALESCE(_submitted_at, current_date),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = _batch_id
     AND organization_id = _organization_id
  RETURNING * INTO batch;

  UPDATE public.health_billing_items billing
     SET status = CASE WHEN billing.status = 'rascunho' THEN 'enviado' ELSE billing.status END,
         billed_at = COALESCE(billing.billed_at, batch.submitted_at),
         updated_at = now(),
         updated_by = auth.uid()
    FROM public.health_billing_batch_items batch_item
   WHERE batch_item.batch_id = batch.id
     AND batch_item.organization_id = _organization_id
     AND billing.id = batch_item.billing_item_id
     AND billing.organization_id = _organization_id;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id,
    auth.uid(),
    'health.billing_batch.submitted',
    'health_billing_batch',
    batch.id,
    jsonb_build_object(
      'protocol_number', batch.protocol_number,
      'submitted_at', batch.submitted_at
    )
  );

  RETURN jsonb_build_object(
    'id', batch.id,
    'status', batch.status,
    'protocol_number', batch.protocol_number,
    'submitted_at', batch.submitted_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_health_billing_batches(uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_health_billing_batch(uuid, uuid, text, jsonb, date, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.submit_health_billing_batch(uuid, uuid, text, date)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.list_health_billing_batches(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_billing_batch(uuid, uuid, text, jsonb, date, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_health_billing_batch(uuid, uuid, text, date)
  TO authenticated;
