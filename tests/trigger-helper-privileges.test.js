import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260818180000_harden_trigger_helper_privileges.sql",
  "utf8",
);

const functions = [
  "communication_entry_validate_scope",
  "communication_validate_links",
  "financial_guard_immutable_org",
  "financial_validate_links",
];

test("trigger helper migration revokes every client-facing execution grant", () => {
  for (const functionName of functions) {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}\\(\\) FROM ${role};`),
      );
    }
  }
});

test("trigger helper migration preserves trusted backend execution grants", () => {
  for (const functionName of functions) {
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\(\\) TO postgres, service_role;`,
      ),
    );
  }
});
