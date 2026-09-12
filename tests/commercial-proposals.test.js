import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261002120000_commercial_proposals.sql",
  "utf8",
);
const publicRoute = readFileSync("src/routes/proposta.$token.tsx", "utf8");
const worker = readFileSync("supabase/functions/asaas-billing-automation/index.ts", "utf8");
const generatedTypes = readFileSync("src/integrations/supabase/types.ts", "utf8");
const proposalPanel = readFileSync(
  "src/components/reports/commercial-proposals-panel.tsx",
  "utf8",
);

test("proposal conversion is transactional and idempotent", () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /IF proposal\.status='accepted'/);
  assert.match(migration, /financial_transactions_commercial_proposal_uq/);
  assert.match(migration, /converted_client_id=result_client_id/);
  assert.match(migration, /stage='won'/);
  assert.match(migration, /commercial\.proposal\.accepted/);
});

test("public proposal exposes token RPCs without direct table access", () => {
  assert.match(
    migration,
    /REVOKE ALL ON public\.commercial_proposals FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_public_commercial_proposal[\s\S]*TO anon,authenticated/,
  );
  assert.match(migration, /PROPOSAL_CONFIRMATION_REQUIRED/);
  assert.match(migration, /PROPOSAL_EXPIRED/);
  assert.match(publicRoute, /noindex, nofollow/);
  assert.match(publicRoute, /aceite comercial registrado pelo FLUXA/i);
});

test("accepted proposals can queue their first Asaas charge safely", () => {
  assert.match(migration, /IF proposal\.asaas_auto_charge THEN/);
  assert.match(migration, /INSERT INTO public\.asaas_charge_jobs/);
  assert.match(worker, /transaction\.commercial_proposal_id/);
  assert.match(worker, /proposal\.status !== "accepted"/);
  assert.match(worker, /!proposal\.asaas_auto_charge/);
});

test("generated contracts expose proposal tables and RPCs", () => {
  assert.match(generatedTypes, /commercial_proposals: \{/);
  assert.match(generatedTypes, /commercial_proposal_id: string \| null/);
  for (const rpc of [
    "save_commercial_proposal",
    "publish_commercial_proposal",
    "cancel_commercial_proposal",
    "get_public_commercial_proposal",
    "respond_to_commercial_proposal",
  ]) {
    assert.match(generatedTypes, new RegExp(`${rpc}: \\{`));
  }
});


test("proposal form contains selects and formats Brazilian contact fields", () => {
  assert.match(proposalPanel, /w-full min-w-0 max-w-full/);
  assert.match(proposalPanel, /customerPhone: formatPhone\(event\.target\.value\)/);
  assert.match(proposalPanel, /customerDocument: formatDocument\(event\.target\.value\)/);
  assert.match(proposalPanel, /slice\(0, 11\)/);
  assert.match(proposalPanel, /slice\(0, 14\)/);
});
