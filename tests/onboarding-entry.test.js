import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  requiresWorkspaceSetup,
  directOnboardingSubtype,
  initialOnboardingStep,
  previousOnboardingStep,
} from "../src/lib/onboarding-entry.ts";

test("new organization without segment enters setup, including a resumed signup", () => {
  assert.equal(requiresWorkspaceSetup(false, false, null), true);
  assert.equal(requiresWorkspaceSetup(false, true, null), true);
  const login = readFileSync("src/routes/entrar.tsx", "utf8");
  assert.match(login, /data === "client_portal" \? "\/meu-portal" : "\/onboarding"/);
});

test("only selected segment with exploration or completed setup opens the workspace", () => {
  assert.equal(requiresWorkspaceSetup(false, false, "health"), true);
  assert.equal(requiresWorkspaceSetup(false, true, "health"), false);
  assert.equal(requiresWorkspaceSetup(true, false, null), false);
});

test("imobiliária começa com perfil geral e não oferece a etapa redundante ao voltar ou retomar", () => {
  assert.equal(directOnboardingSubtype("real_estate"), "brokerage");
  for (const segment of ["health", "legal", "engineering", null])
    assert.equal(directOnboardingSubtype(segment), null);
  assert.equal(initialOnboardingStep(null, null, 0), 0);
  assert.equal(initialOnboardingStep("real_estate", null, 0), 0);
  assert.equal(initialOnboardingStep("real_estate", "brokerage", 0), 2);
  assert.equal(initialOnboardingStep("real_estate", "rentals", 1), 3);
  assert.equal(initialOnboardingStep("real_estate", "property_management", 3), 5);
  assert.equal(initialOnboardingStep("legal", null, 0), 1);
  assert.equal(previousOnboardingStep(2, "real_estate"), 0);
  assert.equal(previousOnboardingStep(3, "real_estate"), 2);
  assert.equal(previousOnboardingStep(2, "legal"), 1);
});
