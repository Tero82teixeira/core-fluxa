import assert from "node:assert/strict";
import { test } from "node:test";

import {
  healthWorkspaceHome,
  isFocusedHealthWorkspace,
  routeVisibleForModules,
} from "../src/lib/organization-segments.ts";

test("existing health organizations keep their general workspace", () => {
  const settings = { business_segment: "health", focused_health_workspace: false };
  assert.equal(isFocusedHealthWorkspace(settings), false);
  assert.equal(routeVisibleForModules("/processos", "health", ["processes"], false), true);
});

test("new health workspaces show clinical routes and block generic routes", () => {
  const enabled = ["processes", "documents", "health_patients", "health_appointments"];
  assert.equal(
    isFocusedHealthWorkspace({ business_segment: "health", focused_health_workspace: true }),
    true,
  );
  assert.equal(routeVisibleForModules("/saude/pacientes", "health", enabled, true), true);
  assert.equal(routeVisibleForModules("/processos", "health", enabled, true), false);
  assert.equal(routeVisibleForModules("/documentos", "health", enabled, true), false);
  assert.equal(routeVisibleForModules("/central", "health", enabled, true), false);
  assert.equal(routeVisibleForModules("/configuracoes", "health", enabled, true), true);
  assert.equal(routeVisibleForModules("/advocacia/painel-juridico", "health", enabled, true), false);
  assert.equal(healthWorkspaceHome(enabled), "/saude/painel-clinica");
  assert.equal(healthWorkspaceHome(["health_billing"]), "/saude/contas-medicas");
});

test("health flag does not affect a legal organization", () => {
  assert.equal(
    isFocusedHealthWorkspace({ business_segment: "legal", focused_health_workspace: true }),
    false,
  );
  assert.equal(routeVisibleForModules("/processos", "legal", ["processes"], false), true);
  assert.equal(routeVisibleForModules("/saude/pacientes", "legal", ["health_patients"], false), false);
});
