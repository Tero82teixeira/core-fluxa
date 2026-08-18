-- ETAPA 12: impede inconsistencias contabeis e restaura as protecoes de
-- recorrencias no estado efetivamente aplicado, sem alterar as leituras RLS.
CREATE OR REPLACE FUNCTION public.update_financial_transaction(
  _organization_id uuid,
  _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v uuid := (_payload->>'id')::uuid;
  new_amount numeric;
  paid_total numeric;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  -- Serializa a validacao com registro/estorno de pagamentos, que tambem
  -- bloqueiam a transacao, evitando uma verificacao time-of-check/time-of-use.
  SELECT COALESCE(NULLIF(_payload->>'amount', '')::numeric, amount)
    INTO new_amount
    FROM public.financial_transactions
   WHERE id = v
     AND organization_id = _organization_id
     AND status IN ('pending', 'overdue', 'partial')
     AND archived_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSACTION_NOT_EDITABLE'; END IF;

  SELECT COALESCE(sum(amount), 0)
    INTO paid_total
    FROM public.financial_transaction_payments
   WHERE transaction_id = v
     AND reversed_at IS NULL;
  IF new_amount < paid_total THEN RAISE EXCEPTION 'AMOUNT_BELOW_PAID_TOTAL'; END IF;

  UPDATE public.financial_transactions SET
    description = COALESCE(_payload->>'description', description),
    amount = new_amount,
    due_date = COALESCE(NULLIF(_payload->>'due_date', '')::date, due_date),
    category_id = CASE WHEN _payload ? 'category_id' THEN NULLIF(_payload->>'category_id', '')::uuid ELSE category_id END,
    account_id = CASE WHEN _payload ? 'account_id' THEN NULLIF(_payload->>'account_id', '')::uuid ELSE account_id END,
    notes = COALESCE(_payload->>'notes', notes)
  WHERE id = v;

  PERFORM public.financial_audit(_organization_id, 'financial.transaction.updated', 'financial_transaction', v);
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.update_financial_transaction(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_financial_transaction(uuid, jsonb) TO authenticated;

-- Reinstala literalmente a validacao segura versionada na migration 120000.
CREATE OR REPLACE FUNCTION public.financial_validate_recurrence_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id = NEW.category_id AND organization_id = NEW.organization_id) THEN RAISE EXCEPTION 'INVALID_CATEGORY_ORGANIZATION'; END IF;
  IF NEW.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = NEW.account_id AND organization_id = NEW.organization_id) THEN RAISE EXCEPTION 'INVALID_ACCOUNT_ORGANIZATION'; END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id AND organization_id = NEW.organization_id) THEN RAISE EXCEPTION 'INVALID_CLIENT_ORGANIZATION'; END IF;
  IF NEW.process_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.processes WHERE id = NEW.process_id AND organization_id = NEW.organization_id) THEN RAISE EXCEPTION 'INVALID_PROCESS_ORGANIZATION'; END IF;
  IF NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN RAISE EXCEPTION 'INVALID_END_DATE'; END IF;
  IF NEW.next_run_date < NEW.start_date THEN RAISE EXCEPTION 'INVALID_NEXT_RUN_DATE'; END IF;
  IF NEW.end_date IS NOT NULL AND NEW.next_run_date > NEW.end_date AND NEW.status <> 'finished' THEN RAISE EXCEPTION 'INVALID_NEXT_RUN_DATE'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.financial_validate_recurrence_links() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS financial_validate_recurrence_links ON public.financial_recurrences;
CREATE TRIGGER financial_validate_recurrence_links BEFORE INSERT OR UPDATE ON public.financial_recurrences
FOR EACH ROW EXECUTE FUNCTION public.financial_validate_recurrence_links();

-- Reaplica a versao endurecida e expansiva da migration 130000.
CREATE OR REPLACE FUNCTION public.update_financial_recurrence(_organization_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    name = COALESCE(NULLIF(trim(_payload->>'name'), ''), name), type = recurrence_type, amount = recurrence_amount,
    category_id = CASE WHEN _payload ? 'category_id' THEN NULLIF(_payload->>'category_id', '')::uuid ELSE category_id END,
    account_id = CASE WHEN _payload ? 'account_id' THEN NULLIF(_payload->>'account_id', '')::uuid ELSE account_id END,
    frequency = recurrence_frequency, interval_count = recurrence_interval,
    start_date = COALESCE(NULLIF(_payload->>'start_date', '')::date, start_date),
    end_date = CASE WHEN _payload ? 'end_date' THEN NULLIF(_payload->>'end_date', '')::date ELSE end_date END,
    next_run_date = COALESCE(NULLIF(_payload->>'next_run_date', '')::date, next_run_date),
    client_id = CASE WHEN _payload ? 'client_id' THEN NULLIF(_payload->>'client_id', '')::uuid ELSE client_id END,
    process_id = CASE WHEN _payload ? 'process_id' THEN NULLIF(_payload->>'process_id', '')::uuid ELSE process_id END,
    notes = CASE WHEN _payload ? 'notes' THEN _payload->>'notes' ELSE notes END, status = recurrence_status
  WHERE id = recurrence_id AND organization_id = _organization_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public.financial_audit(_organization_id, 'financial.recurrence.updated', 'financial_recurrence', recurrence_id);
  RETURN recurrence_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_financial_recurrence(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_financial_recurrence(uuid, jsonb) TO authenticated;

-- O cliente le via RLS, mas toda escrita passa exclusivamente pelas RPCs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.financial_categories, public.financial_accounts, public.financial_transactions,
  public.financial_transaction_payments, public.financial_recurrences, public.financial_account_movements
FROM authenticated, anon;
