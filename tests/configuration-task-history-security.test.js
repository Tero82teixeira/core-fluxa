import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260818200000_harden_configuration_and_task_history_rls.sql",
  "utf8",
);

test("migration replaces broad configuration policies with read and admin-write policies", () => {
  for (const table of ["process_stages", "service_types"]) {
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS "${table}_all"`));
    assert.match(
      migration,
      new RegExp(
        `CREATE POLICY "${table}_select"[\\s\\S]+?ON public\\.${table}[\\s\\S]+?FOR SELECT`,
      ),
    );
    for (const operation of ["insert", "update", "delete"]) {
      assert.match(
        migration,
        new RegExp(
          `CREATE POLICY "${table}_${operation}"[\\s\\S]+?ON public\\.${table}[\\s\\S]+?FOR ${operation.toUpperCase()}`,
        ),
      );
    }
  }
  assert.match(migration, /public\.is_org_member\(organization_id\)/);
  assert.match(
    migration,
    /ARRAY\['superadmin', 'proprietario', 'administrador'\]::public\.app_role\[\]/,
  );
});

test("migration makes task history client roles read-only", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "task_history_insert"/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.task_history FROM authenticated/,
  );
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.task_history FROM anon/);
  assert.doesNotMatch(migration, /CREATE POLICY\s+"?task_history_insert/i);
  assert.match(migration, /task\.id = task_history\.task_id/);
  assert.match(migration, /task\.organization_id = task_history\.organization_id/);
});

test("migration is scoped to the three audited tables", () => {
  const referencedTables = [...migration.matchAll(/(?:ON(?: TABLE)?|public)\s+public\.(\w+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual([...new Set(referencedTables)].sort(), [
    "process_stages",
    "service_types",
    "task_history",
  ]);
});
