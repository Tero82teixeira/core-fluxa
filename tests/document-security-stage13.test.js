import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260818220000_harden_document_privileges_rls.sql";
const migration = readFileSync(migrationPath, "utf8");

test("stage 13 revokes dangerous document table privileges", () => {
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES[\s\S]+FROM anon/,
  );
  assert.match(migration, /REVOKE TRUNCATE, TRIGGER, REFERENCES[\s\S]+FROM authenticated/);
  assert.match(
    migration,
    /REVOKE DELETE ON TABLE public\.documents, public\.document_versions, public\.document_types FROM authenticated/,
  );
});

test("stage 13 canonical policies exclude the legacy atendimento role", () => {
  const policyStatements = [...migration.matchAll(/CREATE POLICY[\s\S]+?;/g)].map(
    (match) => match[0],
  );
  assert.equal(policyStatements.length, 8);
  assert.ok(policyStatements.every((statement) => !/atendimento/i.test(statement)));
  assert.match(
    migration,
    /ARRAY\['superadmin', 'proprietario', 'administrador', 'gestor', 'operacional'\]::public\.app_role\[\]/,
  );
});

test("stage 13 preserves and locks down all existing document guards", () => {
  for (const guard of [
    "documents_authorization_guard",
    "document_versions_authorization_guard",
    "documents_enforce_links",
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${guard}\\(\\) FROM PUBLIC, anon, authenticated`),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`(?:CREATE OR REPLACE|DROP) FUNCTION public\\.${guard}`),
    );
  }
});

test("stage 13 is scoped to the three document tables", () => {
  const tables = [
    ...migration.matchAll(/public\.(documents|document_versions|document_types)/g),
  ].map((match) => match[1]);
  assert.deepEqual([...new Set(tables)].sort(), [
    "document_types",
    "document_versions",
    "documents",
  ]);
});
