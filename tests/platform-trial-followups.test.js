import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  matchesPlatformTrialFollowupFilter,
  platformTrialFollowupIsDue,
  whatsappUrl,
} from "../src/lib/platform-trial-followups.ts";

const migration = readFileSync(
  "supabase/migrations/20261004120000_platform_trial_followups.sql",
  "utf8",
);
const route = readFileSync("src/routes/_authenticated/administracao-plataforma.tsx", "utf8");

const followup = (overrides = {}) => ({
  organization_id: "org-1",
  status: "following",
  next_contact_at: "2026-09-12T11:00:00Z",
  last_contact_at: "2026-09-10T11:00:00Z",
  notes: "Cliente conhecendo o financeiro.",
  updated_at: "2026-09-10T11:00:00Z",
  ...overrides,
});

test("classifica contatos vencidos e empresas ainda não contatadas", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  assert.equal(platformTrialFollowupIsDue(followup(), now), true);
  assert.equal(platformTrialFollowupIsDue(followup({ status: "not_interested" }), now), false);
  assert.equal(matchesPlatformTrialFollowupFilter(undefined, "not_contacted", now), true);
  assert.equal(matchesPlatformTrialFollowupFilter(followup(), "due", now), true);
  assert.equal(matchesPlatformTrialFollowupFilter(followup(), "interested", now), false);
});

test("gera link seguro do WhatsApp usando telefone brasileiro", () => {
  const url = whatsappUrl("(28) 99999-9999", "Olá, tudo bem?");
  assert.equal(url, "https://wa.me/5528999999999?text=Ol%C3%A1%2C%20tudo%20bem%3F");
  assert.equal(whatsappUrl("123", "Olá"), null);
});

test("acompanhamento da plataforma permanece privado e auditado", () => {
  assert.match(migration, /platform_trial_followups ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.platform_trial_followups FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(migration, /PLATFORM_ADMIN_REQUIRED/);
  assert.match(migration, /platform\.trial_followup\.updated/);
  assert.match(migration, /owner_profile\.phone/);
});

test("administração oferece filtros, histórico e atalhos de contato", () => {
  assert.match(route, /Retornos vencidos/);
  assert.match(route, /Ainda não contatados/);
  assert.match(route, /Registrar contato/);
  assert.match(route, /Abrir WhatsApp/);
  assert.match(route, /Enviar e-mail/);
  assert.match(route, /Contato realizado agora/);
});
