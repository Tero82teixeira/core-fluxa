-- The original automations migration could not be parsed on a clean database.
-- Reapply the corrected definition for databases that already recorded that
-- migration, so clean and existing environments converge on the same function.
CREATE OR REPLACE FUNCTION public.automation_conditions_match(_conditions jsonb, _payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c jsonb;
  actual text;
  expected text;
  condition_failed boolean;
BEGIN
  FOR c IN SELECT value FROM jsonb_array_elements(_conditions) LOOP
    actual := _payload->>(c->>'field');
    expected := c->>'value';
    condition_failed := CASE c->>'operator'
      WHEN 'equals' THEN actual IS DISTINCT FROM expected
      WHEN 'not_equals' THEN actual IS NOT DISTINCT FROM expected
      WHEN 'contains' THEN position(lower(coalesce(expected, '')) in lower(coalesce(actual, ''))) = 0
      WHEN 'is_empty' THEN actual IS NOT NULL AND actual <> ''
      WHEN 'is_not_empty' THEN actual IS NULL OR actual = ''
      WHEN 'before' THEN actual IS NULL OR actual::timestamptz >= expected::timestamptz
      WHEN 'after' THEN actual IS NULL OR actual::timestamptz <= expected::timestamptz
      ELSE true
    END;

    IF condition_failed THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;
