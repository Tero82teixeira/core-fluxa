CREATE OR REPLACE FUNCTION public.tasks_sync_assignee_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignee_name text;
BEGIN
  IF NEW.assignee_id IS NULL THEN
    NEW.assignee_name := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
    OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
    OR NULLIF(BTRIM(COALESCE(NEW.assignee_name, '')), '') IS NULL
  THEN
    SELECT p.full_name
    INTO v_assignee_name
    FROM public.profiles p
    WHERE p.id = NEW.assignee_id;

    IF v_assignee_name IS NOT NULL THEN
      NEW.assignee_name := v_assignee_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_assignee_name_trg
ON public.tasks;

CREATE TRIGGER tasks_sync_assignee_name_trg
BEFORE INSERT OR UPDATE OF assignee_id, assignee_name
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.tasks_sync_assignee_name();

REVOKE ALL
ON FUNCTION public.tasks_sync_assignee_name()
FROM PUBLIC, anon, authenticated;

UPDATE public.tasks AS t
SET assignee_name = p.full_name
FROM public.profiles AS p
WHERE t.assignee_id = p.id
  AND t.assignee_id IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(t.assignee_name, '')), '') IS NULL
  AND NULLIF(BTRIM(COALESCE(p.full_name, '')), '') IS NOT NULL;
