import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260824200000_automatic_document_internal_codes.sql",
  "utf8",
);
const pgTap = readFileSync(
  "supabase/tests/database/029_document_internal_codes.sql",
  "utf8",
);
const hooks = readFileSync("src/hooks/use-documents.ts", "utf8");
const list = readFileSync("src/components/documents/document-list.tsx", "utf8");
const upload = readFileSync(
  "src/components/documents/document-upload-dialog.tsx",
  "utf8",
);
const search = readFileSync("src/hooks/use-operations.ts", "utf8");
const databaseTypes = readFileSync(
  "src/integrations/supabase/types.ts",
  "utf8",
);

test("codes are tenant-scoped, year-scoped and assigned atomically", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.document_code_counters/);
  assert.match(migration, /PRIMARY KEY \(organization_id, code_year\)/);
  assert.match(migration, /ON CONFLICT \(organization_id, code_year\) DO UPDATE/);
  assert.match(migration, /last_value = public\.document_code_counters\.last_value \+ 1/);
  assert.match(migration, /'DOC-' \|\| code_year::text/);
  assert.match(migration, /lpad\(next_value::text, 6, '0'\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS documents_organization_internal_code_key/);
});

test("existing documents are backfilled without resetting counters", () => {
  assert.match(migration, /WHERE nullif\(trim\(document\.internal_code\), ''\) IS NULL/);
  assert.match(migration, /max\(substring\(document\.internal_code/);
  assert.match(migration, /greatest\([\s\S]*document_code_counters\.last_value/);
  assert.match(migration, /ORDER BY document\.organization_id, document\.created_at, document\.id/);
  assert.match(migration, /ALTER COLUMN internal_code SET NOT NULL/);
  assert.match(pgTap, /every pre-existing document was backfilled/);
});

test("clients cannot choose, mutate or inspect internal sequencing", () => {
  assert.match(migration, /Always replace client input/);
  assert.match(migration, /DOCUMENT_INTERNAL_CODE_IMMUTABLE/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.document_code_counters[\s\S]*PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.assign_document_internal_code\(\)[\s\S]*PUBLIC, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(hooks, /internal_code:\s*input\./);
});

test("official number remains separate while the internal code is visible and searchable", () => {
  assert.match(upload, /Número oficial \/ identificação \(opcional\)/);
  assert.match(upload, /Código interno/);
  assert.match(upload, /Gerado automaticamente/);
  assert.match(list, /document\.internal_code/);
  assert.match(list, /Número oficial:/);
  assert.match(hooks, /internal_code\.ilike/);
  assert.match(search, /internal_code\.ilike/);
  assert.match(databaseTypes, /document_code_counters:/);
  assert.match(databaseTypes, /internal_code: string/);
});
