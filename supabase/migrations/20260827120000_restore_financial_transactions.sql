-- Stage 43: allow authorized financial managers to restore archived final-state
-- transactions without changing their status, payments, balances or history.
CREATE OR REPLACE FUNCTION public.restore_financial_transaction(
  _organization_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  transaction_id uuid := nullif(_payload->>'id', '')::uuid;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  UPDATE public.financial_transactions
  SET archived_at = NULL
  WHERE id = transaction_id
    AND organization_id = _organization_id
    AND archived_at IS NOT NULL
    AND status IN ('paid', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSACTION_NOT_RESTORABLE';
  END IF;

  PERFORM public.financial_audit(
    _organization_id,
    'financial.transaction.restored',
    'financial_transaction',
    transaction_id
  );
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_financial_transaction(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_financial_transaction(uuid, jsonb)
  TO authenticated;
