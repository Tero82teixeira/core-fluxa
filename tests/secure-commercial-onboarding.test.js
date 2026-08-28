import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260828234000_secure_commercial_onboarding.sql",
  "utf8",
);
const onboarding = readFileSync("src/routes/_authenticated/onboarding.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("onboarding usa somente a RPC protegida", () => {
  assert.match(onboarding, /rpc\("update_organization_onboarding"/);
  assert.doesNotMatch(onboarding, /\.from\("organizations"\)[\s\S]{0,180}\.update\(/);
  assert.doesNotMatch(onboarding, /\.from\("organization_settings"\)[\s\S]{0,180}\.upsert\(/);
});

test("clientes não atualizam organizations diretamente", () => {
  assert.match(migration, /REVOKE UPDATE ON public\.organizations FROM authenticated/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /ONBOARDING_ACCESS_DENIED/);
  assert.match(migration, /ONBOARDING_STEP_OUT_OF_SEQUENCE/);
});

test("RPC limita os campos comerciais e está tipada", () => {
  assert.doesNotMatch(migration, /SET commercial_status\s*=/);
  assert.doesNotMatch(migration, /SET trial_(?:started|ends)_at\s*=/);
  assert.match(types, /update_organization_onboarding:/);
});
