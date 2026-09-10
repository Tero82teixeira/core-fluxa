-- Links financial entries to their real business context so profitability and
-- cash-flow forecasts remain explainable, tenant-safe and auditable.

CREATE INDEX financial_transactions_client_result_idx
  ON public.financial_transactions(
    organization_id,
    client_id,
    (COALESCE(competence_date, due_date))
  )
  WHERE archived_at IS NULL AND status <> 'cancelled';

CREATE INDEX financial_transactions_process_result_idx
  ON public.financial_transactions(
    organization_id,
    process_id,
    (COALESCE(competence_date, due_date))
  )
  WHERE archived_at IS NULL AND status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.financial_validate_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.financial_categories AS category
     WHERE category.id = NEW.category_id AND category.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'INVALID_CATEGORY_ORGANIZATION'; END IF;
  IF NEW.account_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.financial_accounts AS account
     WHERE account.id = NEW.account_id AND account.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'INVALID_ACCOUNT_ORGANIZATION'; END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.clients AS client
     WHERE client.id = NEW.client_id AND client.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'INVALID_CLIENT_ORGANIZATION'; END IF;
  IF NEW.process_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.processes AS process
     WHERE process.id = NEW.process_id AND process.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'INVALID_PROCESS_ORGANIZATION'; END IF;
  IF NEW.client_id IS NOT NULL AND NEW.process_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.processes AS process
     WHERE process.id = NEW.process_id
       AND process.organization_id = NEW.organization_id
       AND process.client_id = NEW.client_id
  ) THEN RAISE EXCEPTION 'INVALID_PROCESS_CLIENT'; END IF;
  IF NEW.task_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.tasks AS task
     WHERE task.id = NEW.task_id AND task.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'INVALID_TASK_ORGANIZATION'; END IF;
  IF NEW.document_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.documents AS document
     WHERE document.id = NEW.document_id AND document.organization_id = NEW.organization_id
  ) THEN RAISE EXCEPTION 'INVALID_DOCUMENT_ORGANIZATION'; END IF;
  IF NEW.responsible_user_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.organization_members AS member
     WHERE member.user_id = NEW.responsible_user_id
       AND member.organization_id = NEW.organization_id
       AND member.is_active
  ) THEN RAISE EXCEPTION 'INVALID_RESPONSIBLE_ORGANIZATION'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_financial_transaction(
  _organization_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  target_transaction_id uuid := NULLIF(_payload->>'id', '')::uuid;
  new_amount numeric;
  paid_total numeric;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  SELECT COALESCE(NULLIF(_payload->>'amount', '')::numeric, amount)
    INTO new_amount
    FROM public.financial_transactions
   WHERE id = target_transaction_id
     AND organization_id = _organization_id
     AND status IN ('pending', 'overdue', 'partial')
     AND archived_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSACTION_NOT_EDITABLE'; END IF;

  SELECT COALESCE(sum(amount), 0)
    INTO paid_total
    FROM public.financial_transaction_payments
   WHERE transaction_id = target_transaction_id
     AND reversed_at IS NULL;
  IF new_amount < paid_total THEN RAISE EXCEPTION 'AMOUNT_BELOW_PAID_TOTAL'; END IF;

  UPDATE public.financial_transactions
     SET description = COALESCE(NULLIF(btrim(_payload->>'description'), ''), description),
         amount = new_amount,
         due_date = COALESCE(NULLIF(_payload->>'due_date', '')::date, due_date),
         competence_date = CASE WHEN _payload ? 'competence_date'
           THEN NULLIF(_payload->>'competence_date', '')::date ELSE competence_date END,
         category_id = CASE WHEN _payload ? 'category_id'
           THEN NULLIF(_payload->>'category_id', '')::uuid ELSE category_id END,
         account_id = CASE WHEN _payload ? 'account_id'
           THEN NULLIF(_payload->>'account_id', '')::uuid ELSE account_id END,
         client_id = CASE WHEN _payload ? 'client_id'
           THEN NULLIF(_payload->>'client_id', '')::uuid ELSE client_id END,
         process_id = CASE WHEN _payload ? 'process_id'
           THEN NULLIF(_payload->>'process_id', '')::uuid ELSE process_id END,
         notes = CASE WHEN _payload ? 'notes' THEN _payload->>'notes' ELSE notes END
   WHERE id = target_transaction_id AND organization_id = _organization_id;

  PERFORM public.financial_audit(
    _organization_id,
    'financial.transaction.updated',
    'financial_transaction',
    target_transaction_id,
    jsonb_build_object(
      'profitability_links_reviewed',
      _payload ? 'client_id' OR _payload ? 'process_id' OR _payload ? 'competence_date'
    )
  );
  RETURN target_transaction_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.financial_validate_links() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_financial_transaction(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_financial_transaction(uuid, jsonb) TO authenticated;
