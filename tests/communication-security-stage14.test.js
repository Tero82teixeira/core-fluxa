import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260819120000_harden_communication_privileges.sql",
  "utf8",
);

const operationalRpcs = [
  "create_communication_thread",
  "add_communication_entry",
  "update_communication_thread",
  "change_communication_thread_status",
  "assign_communication_thread",
  "archive_communication_thread",
];

test("stage 14 removes direct communication table powers without revoking authenticated SELECT", () => {
  assert.match(migration, /REVOKE TRUNCATE, TRIGGER, REFERENCES[\s\S]+FROM authenticated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE[\s\S]+FROM authenticated, anon/);
  assert.match(migration, /REVOKE SELECT, TRUNCATE, TRIGGER, REFERENCES[\s\S]+FROM anon/);
  assert.doesNotMatch(migration, /REVOKE[^;]*SELECT[^;]*FROM authenticated/);
});

test("stage 14 closes all internal communication helpers", () => {
  for (const helper of [
    "communication_assert_role\\(uuid, boolean\\)",
    "communication_validate_links\\(\\)",
    "communication_entry_validate_scope\\(\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${helper}\\s+FROM PUBLIC, anon, authenticated`),
    );
  }
});

test("stage 14 exposes exactly the six operational RPC names to authenticated clients", () => {
  const grant = migration.match(/GRANT EXECUTE ON FUNCTION([\s\S]+?)TO authenticated;/)?.[1] ?? "";
  assert.deepEqual(
    operationalRpcs.filter((rpc) => grant.includes(`public.${rpc}(`)),
    operationalRpcs,
  );
  assert.equal((grant.match(/public\.[a-z_]+\(/g) ?? []).length, 6);
  for (const rpc of operationalRpcs) {
    assert.match(migration, new RegExp(`public\\.${rpc}\\(`));
  }
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon;/);
});

test("stage 14 is additive and does not alter functions, RLS, or unrelated modules", () => {
  assert.doesNotMatch(migration, /CREATE(?: OR REPLACE)? FUNCTION|DROP FUNCTION/i);
  assert.doesNotMatch(migration, /(?:CREATE|ALTER|DROP) POLICY|ROW LEVEL SECURITY/i);
  const tables = [...migration.matchAll(/public\.(communication_threads|communication_entries)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual([...new Set(tables)].sort(), ["communication_entries", "communication_threads"]);
});
