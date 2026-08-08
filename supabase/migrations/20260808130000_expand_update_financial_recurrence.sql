-- Expand only the recurrence update RPC. Link ownership remains enforced by
-- financial_validate_recurrence_links, installed by the preceding migration.
CREATE OR REPLACE FUNCTION public.update_financial_recurrence(
  _organization_id uuid,
  _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recurrence_id uuid := NULLIF(_payload->>'id', '')::uuid;
  recurrence_type text;
  recurrence_frequency text;
  recurrence_status text;
  recurrence_amount numeric;
  recurrence_interval integer;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  recurrence_type := COALESCE(NULLIF(_payload->>'type', ''), (SELECT type FROM public.financial_recurrences WHERE id = recurrence_id AND organization_id = _organization_id));
  recurrence_frequency := COALESCE(NULLIF(_payload->>'frequency', ''), (SELECT frequency FROM public.financial_recurrences WHERE id = recurrence_id AND organization_id = _organization_id));
  recurrence_status := COALESCE(NULLIF(_payload->>'status', ''), (SELECT status FROM public.financial_recurrences WHERE id = recurrence_id AND organization_id = _organization_id));
  recurrence_amount := COALESCE(NULLIF(_payload->>'amount', '')::numeric, (SELECT amount FROM public.financial_recurrences WHERE id = recurrence_id AND organization_id = _organization_id));
  recurrence_interval := COALESCE(NULLIF(_payload->>'interval_count', '')::integer, (SELECT interval_count FROM public.financial_recurrences WHERE id = recurrence_id AND organization_id = _organization_id));

  IF recurrence_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'INVALID_RECURRENCE_TYPE'; END IF;
  IF recurrence_frequency NOT IN ('weekly', 'monthly', 'quarterly', 'yearly') THEN RAISE EXCEPTION 'INVALID_FREQUENCY'; END IF;
  IF recurrence_status NOT IN ('active', 'paused', 'finished') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF recurrence_amount IS NULL OR recurrence_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF recurrence_interval IS NULL OR recurrence_interval <= 0 THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;

  UPDATE public.financial_recurrences SET
    name = COALESCE(NULLIF(trim(_payload->>'name'), ''), name),
    type = recurrence_type,
    amount = recurrence_amount,
    category_id = CASE WHEN _payload ? 'category_id' THEN NULLIF(_payload->>'category_id', '')::uuid ELSE category_id END,
    account_id = CASE WHEN _payload ? 'account_id' THEN NULLIF(_payload->>'account_id', '')::uuid ELSE account_id END,
    frequency = recurrence_frequency,
    interval_count = recurrence_interval,
    start_date = COALESCE(NULLIF(_payload->>'start_date', '')::date, start_date),
    end_date = CASE WHEN _payload ? 'end_date' THEN NULLIF(_payload->>'end_date', '')::date ELSE end_date END,
    next_run_date = COALESCE(NULLIF(_payload->>'next_run_date', '')::date, next_run_date),
    client_id = CASE WHEN _payload ? 'client_id' THEN NULLIF(_payload->>'client_id', '')::uuid ELSE client_id END,
    process_id = CASE WHEN _payload ? 'process_id' THEN NULLIF(_payload->>'process_id', '')::uuid ELSE process_id END,
    notes = CASE WHEN _payload ? 'notes' THEN _payload->>'notes' ELSE notes END,
    status = recurrence_status
  WHERE id = recurrence_id AND organization_id = _organization_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public.financial_audit(_organization_id, 'financial.recurrence.updated', 'financial_recurrence', recurrence_id);
  RETURN recurrence_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_financial_recurrence(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_financial_recurrence(uuid, jsonb) TO authenticated;
