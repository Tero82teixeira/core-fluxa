import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const page = readFileSync("src/routes/_authenticated/advocacia.painel-juridico.tsx", "utf8");
const summary = readFileSync("src/lib/legal-workspace.ts", "utf8");
const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const modules = readFileSync("src/lib/organization-segments.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261019120000_legal_workspace_foundation.sql",
  "utf8",
);

describe("FLUXA Advocacia — Painel Jurídico", () => {
  test("reaproveita o núcleo de processos, tarefas e movimentações", () => {
    assert.match(page, /useProcesses/);
    assert.match(page, /useTasks/);
    assert.match(page, /useRecentActivity/);
    assert.doesNotMatch(page, /supabase\.rpc/);
  });

  test("destaca carteira, prazos, exigências e responsabilidades", () => {
    assert.match(summary, /overdueProcesses/);
    assert.match(summary, /dueToday/);
    assert.match(summary, /dueNextSevenDays/);
    assert.match(summary, /inRequirement/);
    assert.match(summary, /withoutOwner/);
  });

  test("fica disponível somente pelo módulo jurídico", () => {
    assert.match(navigation, /\/advocacia\/painel-juridico/);
    assert.match(navigation, /Painel Jurídico/);
    assert.match(modules, /"\/advocacia\/painel-juridico": "legal_workspace"/);
    assert.match(modules, /group: "legal",\s+available: true/);
  });

  test("ativa o módulo apenas para organizações de Advocacia", () => {
    assert.match(migration, /business_segment = 'legal'/);
    assert.match(migration, /NOT enabled_modules \? 'legal_workspace'/);
    assert.doesNotMatch(migration, /business_segment = 'health'/);
  });
});
