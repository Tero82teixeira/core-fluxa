import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { requiresWorkspaceSetup } from "../src/lib/onboarding-entry.ts";

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
