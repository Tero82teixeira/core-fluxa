import assert from "node:assert/strict";
import { test } from "node:test";

import {
  healthWorkspaceHome,
  isFocusedHealthWorkspace,
  routeVisibleForModules,
  workspaceHomeForSegment,
} from "../src/lib/organization-segments.ts";
import { FOCUSED_HEALTH_HELP_CATEGORIES, HELP_ARTICLES } from "../src/lib/help-center.ts";
import { visibleForFocusedHealth } from "../src/lib/notifications.ts";

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
  assert.equal(routeVisibleForModules("/novidades", "health", enabled, true), false);
  assert.equal(routeVisibleForModules("/configuracoes", "health", enabled, true), true);
  assert.equal(
    routeVisibleForModules("/advocacia/painel-juridico", "health", enabled, true),
    false,
  );
  assert.equal(healthWorkspaceHome(enabled), "/saude/painel-clinica");
  assert.equal(healthWorkspaceHome(["health_billing"]), "/saude/contas-medicas");
});

test("focused health help contains clinical guidance and no process articles", () => {
  const articles = HELP_ARTICLES.filter((article) =>
    FOCUSED_HEALTH_HELP_CATEGORIES.includes(article.category),
  );
  assert.ok(articles.some((article) => article.relatedRoute === "/saude/agenda"));
  assert.ok(articles.some((article) => article.relatedRoute === "/saude/contas-medicas"));
  assert.equal(
    articles.some((article) => article.relatedRoute.startsWith("/processos")),
    false,
  );
  assert.equal(visibleForFocusedHealth({ kind: "legal" }), false);
  assert.equal(visibleForFocusedHealth({ kind: "health" }), true);
});

test("health flag does not affect a legal organization", () => {
  assert.equal(
    isFocusedHealthWorkspace({ business_segment: "legal", focused_health_workspace: true }),
    false,
  );
  assert.equal(routeVisibleForModules("/processos", "legal", ["processes"], false), true);
  assert.equal(
    routeVisibleForModules("/saude/pacientes", "legal", ["health_patients"], false),
    false,
  );
});

test("new health and legal companies enter their own dashboards", () => {
  assert.equal(workspaceHomeForSegment("health", ["health_appointments"], true), "/saude/painel-clinica");
  assert.equal(workspaceHomeForSegment("legal", ["legal_workspace"]), "/advocacia/painel-juridico");
  assert.equal(workspaceHomeForSegment("health", ["health_appointments"], false), "/meu-dia");
  assert.equal(routeVisibleForModules("/advocacia/painel-juridico", "health", ["health_appointments"], true), false);
  assert.equal(routeVisibleForModules("/saude/pacientes", "legal", ["legal_workspace"]), false);
});
