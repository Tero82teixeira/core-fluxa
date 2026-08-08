-- Garante que os vínculos e o período de uma recorrência pertençam ao mesmo contexto.
CREATE OR REPLACE FUNCTION public.financial_validate_recurrence_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.financial_categories
     WHERE id = NEW.category_id
       AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'INVALID_CATEGORY_ORGANIZATION';
  END IF;

  IF NEW.account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.financial_accounts
     WHERE id = NEW.account_id
       AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_ORGANIZATION';
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.clients
     WHERE id = NEW.client_id
       AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'INVALID_CLIENT_ORGANIZATION';
  END IF;

  IF NEW.process_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.processes
     WHERE id = NEW.process_id
       AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'INVALID_PROCESS_ORGANIZATION';
  END IF;

  IF NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'INVALID_END_DATE';
  END IF;

  IF NEW.next_run_date < NEW.start_date THEN
    RAISE EXCEPTION 'INVALID_NEXT_RUN_DATE';
  END IF;

  -- A geração avança a próxima data além do fim ao concluir a recorrência.
  IF NEW.end_date IS NOT NULL
     AND NEW.next_run_date > NEW.end_date
     AND NEW.status <> 'finished' THEN
    RAISE EXCEPTION 'INVALID_NEXT_RUN_DATE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.financial_validate_recurrence_links() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS financial_validate_recurrence_links
  ON public.financial_recurrences;

CREATE TRIGGER financial_validate_recurrence_links
BEFORE INSERT OR UPDATE ON public.financial_recurrences
FOR EACH ROW
EXECUTE FUNCTION public.financial_validate_recurrence_links();
