import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260819140000_restore_document_storage_hardening.sql";
const migration = readFileSync(migrationPath, "utf8");

test("stage 16 keeps the document bucket private and restores orphan cleanup", () => {
  assert.match(migration, /VALUES \('organization-documents', 'organization-documents', false\)/);
  assert.match(migration, /ON CONFLICT \(id\) DO UPDATE\s+SET public = false/);
  assert.match(migration, /DROP POLICY IF EXISTS "org_documents_delete_own_orphan" ON storage\.objects/);
  assert.match(migration, /CREATE POLICY "org_documents_delete_own_orphan"[\s\S]+FOR DELETE[\s\S]+TO authenticated/);
});

test("stage 16 orphan cleanup retains every required security guard", () => {
  for (const guard of [
    "bucket_id = 'organization-documents'",
    "public.storage_path_org(name) IS NOT NULL",
    "public.is_org_member(public.storage_path_org(name))",
    "owner_id = (SELECT auth.uid()::text)",
    "FROM public.documents d",
    "FROM public.document_versions v",
  ]) {
    assert.ok(migration.includes(guard), `missing policy guard: ${guard}`);
  }
});

test("stage 16 does not modify canonical policies, Storage internals, or grants", () => {
  for (const policy of ["select", "insert", "update", "delete"]) {
    assert.doesNotMatch(migration, new RegExp(`(?:DROP|CREATE) POLICY [^;]*org_documents_${policy}\\b`));
  }
  assert.doesNotMatch(migration, /\b(?:CREATE|ALTER|DROP)\s+TRIGGER\b/i);
  assert.doesNotMatch(migration, /\b(?:GRANT|REVOKE)\b/i);
  assert.doesNotMatch(migration, /\b(?:CREATE|ALTER|DROP)\s+FUNCTION\b/i);
});
