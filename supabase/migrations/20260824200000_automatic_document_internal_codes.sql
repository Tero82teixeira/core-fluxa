-- Give every document an immutable, tenant-scoped internal code without
-- replacing the optional official number supplied by the user.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS internal_code text DEFAULT '';

ALTER TABLE public.documents
  ALTER COLUMN internal_code SET DEFAULT '';

CREATE TABLE IF NOT EXISTS public.document_code_counters (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  code_year smallint NOT NULL CHECK (code_year BETWEEN 2000 AND 9999),
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (organization_id, code_year)
);

ALTER TABLE public.document_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.document_code_counters
  FROM PUBLIC, anon, authenticated, service_role;

-- A rerun must not let the assignment trigger compete with the backfill.
DROP TRIGGER IF EXISTS documents_internal_code_guard_trg ON public.documents;

-- Preserve counters that may already exist and recover their floor from every
-- valid code before filling gaps. Deleted documents therefore never cause code
-- reuse.
INSERT INTO public.document_code_counters(
  organization_id, code_year, last_value
)
SELECT
  document.organization_id,
  substring(document.internal_code FROM '^DOC-([0-9]{4})-[0-9]{6,}$')::smallint,
  max(substring(document.internal_code FROM '-([0-9]{6,})$')::bigint)
FROM public.documents AS document
WHERE document.internal_code ~ '^DOC-[0-9]{4}-[0-9]{6,}$'
GROUP BY
  document.organization_id,
  substring(document.internal_code FROM '^DOC-([0-9]{4})-[0-9]{6,}$')::smallint
ON CONFLICT (organization_id, code_year) DO UPDATE
SET last_value = greatest(
  public.document_code_counters.last_value,
  EXCLUDED.last_value
);

-- Existing authorization and timestamp guards intentionally reject maintenance
-- updates without an authenticated actor. Disable only those two triggers for
-- this transactional, internal-code-only backfill, then restore them.
ALTER TABLE public.documents
  DISABLE TRIGGER documents_authorization_guard_trg;
ALTER TABLE public.documents
  DISABLE TRIGGER documents_set_updated_at;

DO $$
DECLARE
  document_row record;
  next_value bigint;
BEGIN
  FOR document_row IN
    SELECT
      document.id,
      document.organization_id,
      extract(
        year FROM document.created_at AT TIME ZONE
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM pg_catalog.pg_timezone_names AS zone
              WHERE zone.name = settings.timezone
            ) THEN settings.timezone
            ELSE 'America/Sao_Paulo'
          END
      )::smallint AS code_year
    FROM public.documents AS document
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = document.organization_id
    WHERE nullif(trim(document.internal_code), '') IS NULL
    ORDER BY document.organization_id, document.created_at, document.id
  LOOP
    INSERT INTO public.document_code_counters(
      organization_id, code_year, last_value
    )
    VALUES (document_row.organization_id, document_row.code_year, 1)
    ON CONFLICT (organization_id, code_year) DO UPDATE
    SET last_value = public.document_code_counters.last_value + 1
    RETURNING last_value INTO next_value;

    UPDATE public.documents
    SET internal_code =
      'DOC-' || document_row.code_year::text || '-' ||
      lpad(next_value::text, 6, '0')
    WHERE id = document_row.id;
  END LOOP;
END;
$$;

ALTER TABLE public.documents
  ENABLE TRIGGER documents_set_updated_at;
ALTER TABLE public.documents
  ENABLE TRIGGER documents_authorization_guard_trg;

ALTER TABLE public.documents
  ALTER COLUMN internal_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'documents_internal_code_format_check'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_internal_code_format_check
      CHECK (internal_code ~ '^DOC-[0-9]{4}-[0-9]{6,}$');
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS documents_organization_internal_code_key
  ON public.documents(organization_id, internal_code);

CREATE OR REPLACE FUNCTION public.assign_document_internal_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  organization_timezone text;
  code_year smallint;
  next_value bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.internal_code IS DISTINCT FROM OLD.internal_code THEN
      RAISE EXCEPTION 'DOCUMENT_INTERNAL_CODE_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_timezone_names AS zone
        WHERE zone.name = settings.timezone
      ) THEN settings.timezone
      ELSE 'America/Sao_Paulo'
    END
  INTO organization_timezone
  FROM public.organizations AS organization
  LEFT JOIN public.organization_settings AS settings
    ON settings.organization_id = organization.id
  WHERE organization.id = NEW.organization_id;

  IF organization_timezone IS NULL THEN
    RAISE EXCEPTION 'DOCUMENT_ORGANIZATION_NOT_FOUND';
  END IF;

  code_year := extract(
    year FROM now() AT TIME ZONE organization_timezone
  )::smallint;

  INSERT INTO public.document_code_counters(
    organization_id, code_year, last_value
  )
  VALUES (NEW.organization_id, code_year, 1)
  ON CONFLICT (organization_id, code_year) DO UPDATE
  SET last_value = public.document_code_counters.last_value + 1
  RETURNING last_value INTO next_value;

  -- Always replace client input so callers cannot choose or impersonate a code.
  NEW.internal_code :=
    'DOC-' || code_year::text || '-' || lpad(next_value::text, 6, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_internal_code_guard_trg
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.assign_document_internal_code();

REVOKE ALL ON FUNCTION public.assign_document_internal_code()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_document_internal_code()
  TO postgres;

