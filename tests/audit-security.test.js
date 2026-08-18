import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auditSource = readFileSync("src/lib/audit.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260818160000_harden_audit_log_integrity.sql",
  "utf8",
);

test("frontend records audit events exclusively through the hardened RPC", () => {
  assert.match(auditSource, /supabase\.rpc\("record_audit_event"/);
  assert.doesNotMatch(auditSource, /from\("audit_logs"\)\.insert/);
  const rpcPayload = auditSource.slice(auditSource.indexOf("supabase.rpc"));
  assert.doesNotMatch(rpcPayload, /actor_(?:id|name)/);
});

test("audit RPC derives identity and enforces active organization membership", () => {
  assert.match(migration, /v_actor_id uuid := auth\.uid\(\)/);
  assert.match(migration, /member\.is_active/);
  assert.match(migration, /profile\.full_name[\s\S]+profile\.id = v_actor_id/);
  assert.doesNotMatch(
    migration.match(/CREATE OR REPLACE FUNCTION[\s\S]+?RETURNS uuid/)[0],
    /actor_(?:id|name)/,
  );
});

test("audit table DML and RPC grants follow least privilege", () => {
  assert.match(migration, /DROP POLICY IF EXISTS audit_insert/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.audit_logs FROM authenticated/,
  );
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.audit_logs FROM anon/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.record_audit_event[\s\S]+ TO authenticated/,
  );
});
