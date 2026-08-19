import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260819150000_harden_database_privileges.sql",
  "utf8",
);

test("stage 18 removes all anon relation privileges and dangerous authenticated privileges", () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE %s FROM anon/);
  assert.match(
    migration,
    /REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %s FROM authenticated/,
  );
  assert.match(migration, /c\.relkind IN \('r', 'p', 'v', 'm', 'f'\)/);
});

test("stage 18 closes known direct-write surfaces without revoking required reads", () => {
  for (const relation of [
    "permissions",
    "role_permissions",
    "client_addresses",
    "client_contacts",
    "audit_logs",
    "financial_transactions",
    "communication_threads",
  ]) {
    assert.match(migration, new RegExp(`public\\.${relation}`));
  }
  assert.doesNotMatch(migration, /REVOKE\s+SELECT[\s\S]*FROM authenticated/i);
  assert.doesNotMatch(migration, /FROM service_role/i);
  assert.doesNotMatch(
    migration,
    /REVOKE\s+(?:INSERT, UPDATE, DELETE|DELETE)\s+ON TABLE[\s\S]*?public\.process_stages[\s\S]*?FROM authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /REVOKE DELETE ON TABLE[\s\S]*?public\.service_types[\s\S]*?FROM authenticated/i,
  );
});

test("stage 18 database test treats PUBLIC as ACL grantee zero", () => {
  const databaseTest = readFileSync(
    "supabase/tests/database/017_database_privileges_hardening.sql",
    "utf8",
  );
  assert.doesNotMatch(databaseTest, /has_(?:table|sequence|function)_privilege\('PUBLIC'/);
  assert.match(databaseTest, /aclexplode/);
  assert.match(databaseTest, /acl\.grantee = 0/g);
  assert.doesNotMatch(databaseTest, /CREATE FUNCTION public\.stage18_default_function_probe/);
  assert.match(databaseTest, /FROM pg_default_acl d/);
  assert.match(databaseTest, /owner_role\.rolname = 'postgres'/);
  assert.match(databaseTest, /n\.nspname = 'public'/);
  assert.match(databaseTest, /d\.defaclobjtype = 'f'/);
});

test("stage 18 secures postgres default privileges for every object class", () => {
  assert.match(
    migration,
    /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;/,
  );
});

test("stage 18 is privilege-only and leaves functional database objects untouched", () => {
  assert.doesNotMatch(migration, /CREATE\s+(?:OR REPLACE\s+)?FUNCTION/i);
  assert.doesNotMatch(migration, /(?:CREATE|ALTER|DROP)\s+POLICY/i);
  assert.doesNotMatch(migration, /ALTER TABLE[^;]*(?:ENABLE|DISABLE|FORCE) ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO|FROM|TABLE)/i);
  assert.doesNotMatch(migration, /storage\.|auth\.|project_id/i);
});
