-- A estrutura existente suporta pagamentos, estornos e geração. Esta alteração mínima
-- completa a edição dos campos já existentes de recorrências pela RPC autorizada.
CREATE OR REPLACE FUNCTION public.update_financial_recurrence(_organization_id uuid,_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=(_payload->>'id')::uuid;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);
  IF _payload ? 'type' AND _payload->>'type' NOT IN ('income','expense') THEN RAISE EXCEPTION 'INVALID_RECURRENCE_TYPE'; END IF;
  IF _payload ? 'frequency' AND _payload->>'frequency' NOT IN ('weekly','monthly','quarterly','yearly') THEN RAISE EXCEPTION 'INVALID_FREQUENCY'; END IF;
  IF _payload ? 'status' AND _payload->>'status' NOT IN ('active','paused','finished') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF _payload ? 'amount' AND NULLIF(_payload->>'amount','')::numeric<=0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF _payload ? 'interval_count' AND NULLIF(_payload->>'interval_count','')::integer<=0 THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;
  UPDATE public.financial_recurrences SET
    name=COALESCE(NULLIF(trim(_payload->>'name'),''),name), type=COALESCE(NULLIF(_payload->>'type',''),type),
    amount=COALESCE(NULLIF(_payload->>'amount','')::numeric,amount), frequency=COALESCE(NULLIF(_payload->>'frequency',''),frequency),
    interval_count=COALESCE(NULLIF(_payload->>'interval_count','')::integer,interval_count), status=COALESCE(NULLIF(_payload->>'status',''),status),
    category_id=CASE WHEN _payload ? 'category_id' THEN NULLIF(_payload->>'category_id','')::uuid ELSE category_id END,
    account_id=CASE WHEN _payload ? 'account_id' THEN NULLIF(_payload->>'account_id','')::uuid ELSE account_id END,
    client_id=CASE WHEN _payload ? 'client_id' THEN NULLIF(_payload->>'client_id','')::uuid ELSE client_id END,
    process_id=CASE WHEN _payload ? 'process_id' THEN NULLIF(_payload->>'process_id','')::uuid ELSE process_id END,
    end_date=CASE WHEN _payload ? 'end_date' THEN NULLIF(_payload->>'end_date','')::date ELSE end_date END,
    next_run_date=COALESCE(NULLIF(_payload->>'next_run_date','')::date,next_run_date), notes=COALESCE(_payload->>'notes',notes)
  WHERE id=v AND organization_id=_organization_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public.financial_audit(_organization_id,'financial.recurrence.updated','financial_recurrence',v);
  RETURN v;
END$$;
REVOKE EXECUTE ON FUNCTION public.update_financial_recurrence(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_financial_recurrence(uuid,jsonb) TO authenticated;
