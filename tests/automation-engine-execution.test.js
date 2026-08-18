import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260818190000_harden_automation_engine_execution.sql",
  "utf8",
);

const signature =
  "public\\.process_automation_event\\(uuid, text, text, uuid, jsonb, uuid, integer, text\\)";

test("automation engine migration revokes direct client execution", () => {
  for (const role of ["PUBLIC", "anon", "authenticated"]) {
    assert.match(
      migration,
      new RegExp(`REVOKE EXECUTE ON FUNCTION ${signature} FROM ${role};`),
    );
  }
});

test("automation engine migration preserves trusted execution", () => {
  for (const role of ["postgres", "service_role"]) {
    assert.match(
      migration,
      new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role};`),
    );
  }
});

test("automation engine migration does not redefine functions or triggers", () => {
  assert.doesNotMatch(migration, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i);
  assert.doesNotMatch(migration, /(?:CREATE|ALTER|DROP)\s+TRIGGER/i);
});
