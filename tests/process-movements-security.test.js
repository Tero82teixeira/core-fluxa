import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260818170000_harden_process_movements.sql",
  "utf8",
);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx", ".js", ".jsx"].includes(extname(path)) ? [path] : [];
  });
}

test("frontend records process movements exclusively through the hardened RPC", () => {
  const frontend = sourceFiles("src")
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.match(frontend, /\.rpc\("record_process_movement"/);
  assert.doesNotMatch(frontend, /\.from\(["']process_movements["']\)\s*\.insert\s*\(/);
});

test("movement RPC derives identity and validates membership and process ownership", () => {
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/);
  assert.match(migration, /member\.is_active/);
  assert.match(migration, /process\.organization_id = _organization_id/);
  assert.match(migration, /profile\.full_name[\s\S]+profile\.id = v_actor_id/);
  const signature = migration.match(/CREATE OR REPLACE FUNCTION[\s\S]+?RETURNS uuid/)[0];
  assert.doesNotMatch(signature, /_actor_name|_created_by/);
  assert.match(migration, /NULLIF\(btrim\(_description\), ''\) IS NULL/);
});

test("movement table DML and RPC grants follow least privilege", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "movements_insert"/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE[\s\S]+FROM authenticated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE[\s\S]+FROM anon/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.record_process_movement[\s\S]+TO authenticated/,
  );
});
