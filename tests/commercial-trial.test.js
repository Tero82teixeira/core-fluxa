import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveCommercialStatus,
  hasCommercialAccess,
  trialDaysRemaining,
} from "../src/lib/commercial-trial.ts";

const now = new Date("2026-08-28T12:00:00.000Z");

test("calcula dias de teste arredondando qualquer fração para cima", () => {
  assert.equal(trialDaysRemaining("2026-08-29T11:59:59.000Z", now), 1);
  assert.equal(trialDaysRemaining("2026-09-11T12:00:00.000Z", now), 14);
});

test("tolera pequeno atraso do relógio do dispositivo sem exibir um dia extra", () => {
  assert.equal(trialDaysRemaining("2026-09-11T12:00:01.000Z", now), 14);
  assert.equal(trialDaysRemaining("2026-08-28T12:01:00.000Z", now), 1);
});

test("deriva vencimento sem alterar o status persistido", () => {
  assert.equal(
    effectiveCommercialStatus({ commercial_status: "trial", trial_ends_at: "2026-08-28T12:00:00.000Z" }, now),
    "expired",
  );
  assert.equal(
    effectiveCommercialStatus({ commercial_status: "trial", trial_ends_at: "2026-08-29T12:00:00.000Z" }, now),
    "trial",
  );
});

test("permite somente empresa ativa ou teste dentro do prazo", () => {
  assert.equal(hasCommercialAccess({ commercial_status: "active", trial_ends_at: null }, now), true);
  assert.equal(hasCommercialAccess({ commercial_status: "suspended", trial_ends_at: null }, now), false);
  assert.equal(
    hasCommercialAccess({ commercial_status: "trial", trial_ends_at: "2026-08-27T12:00:00.000Z" }, now),
    false,
  );
});
