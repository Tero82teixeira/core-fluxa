import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260929120000_public_lead_capture.sql",
  "utf8",
);
const settings = readFileSync("src/components/leads/lead-capture-settings.tsx", "utf8");
const publicPage = readFileSync("src/routes/captar.$token.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

test("public lead capture keeps stored data private and exposes guarded RPCs only", () => {
  assert.match(migration, /lead_capture_forms ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /lead_capture_submissions ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.lead_capture_forms, public\.lead_capture_submissions FROM PUBLIC, anon/,
  );
  assert.match(migration, /SECURITY DEFINER[\s\S]+LEAD_FORM_NOT_AVAILABLE/);
  assert.match(migration, /LEAD_FORM_RATE_LIMIT/);
  assert.match(migration, /LEAD_CONSENT_REQUIRED/);
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE\s+)?public\.lead_capture_(?:forms|submissions)\s+TO\s+(?:anon|authenticated)/i,
  );
});

test("a valid submission creates a lead, opportunity, history and notification", () => {
  assert.match(migration, /INSERT INTO public\.clients\([\s\S]+?'lead'/);
  assert.match(migration, /INSERT INTO public\.commercial_opportunities\([\s\S]+?'first_contact'/);
  assert.match(migration, /INSERT INTO public\.commercial_opportunity_stage_history/);
  assert.match(migration, /'Novo lead recebido'/);
  assert.match(migration, /ORDER BY load\.open_count/);
});

test("settings and public page expose a usable consent-aware flow", () => {
  for (const text of [
    "Captação automática de leads",
    "Criar link de captação",
    "Trocar o link público?",
  ]) {
    assert.ok(settings.includes(text));
  }
  for (const text of ["Seus dados para contato", "Política de Privacidade", "Dados enviados"]) {
    assert.ok(publicPage.includes(text));
  }
  assert.match(types, /lead_capture_forms:/);
  assert.match(types, /lead_capture_submissions:/);
  assert.match(types, /submit_public_lead:/);
});
