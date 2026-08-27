-- Stage 44: allow authorized financial managers to recover archived
-- categories and accounts without making them available to new entries.
CREATE OR REPLACE FUNCTION public.restore_financial_category(
  _organization_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  category_id uuid := nullif(_payload->>'id', '')::uuid;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  UPDATE public.financial_categories
  SET archived_at = NULL,
      is_active = false
  WHERE id = category_id
    AND organization_id = _organization_id
    AND archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATEGORY_NOT_RESTORABLE';
  END IF;

  PERFORM public.financial_audit(
    _organization_id,
    'financial.category.restored',
    'financial_category',
    category_id
  );
  RETURN category_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_financial_account(
  _organization_id uuid,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  account_id uuid := nullif(_payload->>'id', '')::uuid;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);

  UPDATE public.financial_accounts
  SET archived_at = NULL,
      is_active = false
  WHERE id = account_id
    AND organization_id = _organization_id
    AND archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_RESTORABLE';
  END IF;

  PERFORM public.financial_audit(
    _organization_id,
    'financial.account.restored',
    'financial_account',
    account_id
  );
  RETURN account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_financial_category(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.restore_financial_account(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.restore_financial_category(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_financial_account(uuid, jsonb)
  TO authenticated;
