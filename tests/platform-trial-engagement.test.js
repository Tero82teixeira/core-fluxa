import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  matchesTrialEngagementFilter,
  trialNeedsAttention,
  trialUsage,
} from "../src/lib/platform-trial-engagement.ts";

const migration = readFileSync(
  "supabase/migrations/20261003120000_platform_trial_engagement.sql",
  "utf8",
);
const route = readFileSync("src/routes/_authenticated/administracao-plataforma.tsx", "utf8");

const row = (overrides = {}) => ({
  effective_status: "trial",
  onboarding_completed: true,
  created_at: "2026-09-01T12:00:00Z",
  days_remaining: 8,
  last_activity_at: "2026-09-11T12:00:00Z",
  client_count: 1,
  process_count: 1,
  task_count: 1,
  document_count: 0,
  ...overrides,
});

test("classifica o uso do teste sem acessar conteúdo da empresa", () => {
  assert.deepEqual(trialUsage(row()), { level: "engaged", total: 3, modules: 3 });
  assert.equal(trialUsage(row({ process_count: 0, task_count: 0 })).level, "exploring");
  assert.equal(trialUsage(row({ onboarding_completed: false })).level, "not_started");
});

test("destaca teste parado ou perto do vencimento", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  assert.equal(trialNeedsAttention(row(), now), false);
  assert.equal(trialNeedsAttention(row({ days_remaining: 3 }), now), true);
  assert.equal(trialNeedsAttention(row({ last_activity_at: "2026-09-07T12:00:00Z" }), now), true);
  assert.equal(matchesTrialEngagementFilter(row(), "engaged", now), true);
});

test("RPC expõe somente totais agregados e a tela oferece radar comercial", () => {
  for (const field of [
    "client_count",
    "process_count",
    "task_count",
    "document_count",
    "last_activity_at",
  ]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /PLATFORM_ADMIN_REQUIRED/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.platform_organizations\(\) TO authenticated/,
  );
  assert.match(route, /Testes para acompanhar/);
  assert.match(route, /Filtrar por uso do teste/);
  assert.match(route, /Uso do teste/);
});
