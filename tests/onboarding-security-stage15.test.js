import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260819130000_harden_onboarding_invitation_privileges.sql";
const migration = readFileSync(migrationPath, "utf8");

test("stage 15 removes only unnecessary direct table privileges", () => {
  assert.match(migration, /REVOKE TRUNCATE, TRIGGER, REFERENCES[\s\S]*public\.organizations,[\s\S]*public\.organization_members,[\s\S]*public\.organization_invitations,[\s\S]*public\.profiles[\s\S]*FROM authenticated;/);
  assert.match(migration, /REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES\s+ON TABLE public\.organization_invitations\s+FROM anon;/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE\s+ON TABLE public\.organization_members\s+FROM authenticated, anon;/);
  assert.doesNotMatch(migration, /REVOKE[^;]*(?:SELECT|UPDATE)[^;]*ON TABLE[\s\S]*organizations[^;]*FROM authenticated/i);
  assert.doesNotMatch(migration, /REVOKE[^;]*(?:SELECT|INSERT|UPDATE)[^;]*ON TABLE[\s\S]*profiles[^;]*FROM authenticated/i);
});

test("stage 15 drops only obsolete membership write policies", () => {
  for (const policy of ["members_insert", "members_update_admin", "members_delete_admin"]) {
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS ${policy} ON public\\.organization_members;`));
  }
  assert.doesNotMatch(migration, /DROP POLICY[^;]*(?:select|members_select)/i);
  assert.doesNotMatch(migration, /CREATE POLICY|ALTER POLICY/i);
});

test("stage 15 grants the exact reviewed invitation and bootstrap contract", () => {
  const authenticatedGrant = migration.match(/GRANT EXECUTE ON FUNCTION([\s\S]*?)TO authenticated;/)?.[1] ?? "";
  for (const signature of [
    "bootstrap_organization()",
    "accept_invitation(text)",
    "create_invitation(uuid,text,public.app_role)",
    "cancel_invitation(uuid)",
  ]) {
    assert.ok(authenticatedGrant.includes(`public.${signature}`), signature);
  }
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.invitation_preview\(text\)\s+TO anon, authenticated;/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.(?!invitation_preview)[^;]+\s+TO anon/i);
  assert.match(migration, /pending_invitation_diagnostics\(\)[\s\S]*REVOKE ALL ON FUNCTION public\.pending_invitation_diagnostics\(\) FROM PUBLIC, anon, authenticated/);
});

test("stage 15 is additive and does not replace RPC bodies or touch excluded modules", () => {
  assert.doesNotMatch(migration, /CREATE(?: OR REPLACE)? FUNCTION|DROP FUNCTION/i);
  assert.doesNotMatch(migration, /communication_|financial|document|send-team-invitation/i);
});
