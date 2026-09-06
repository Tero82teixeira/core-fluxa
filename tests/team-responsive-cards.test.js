import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/routes/_authenticated/equipe.tsx", "utf8");

test("team members use readable responsive cards instead of compressed columns", () => {
  assert.match(page, /space-y-4 p-4 sm:p-5/);
  assert.match(page, /sm:grid-cols-2 xl:grid-cols-5/);
  assert.match(page, /break-all text-sm text-muted-foreground/);
  assert.match(page, /flex flex-wrap gap-2 border-t pt-4/);
  assert.doesNotMatch(page, /repeat\(6,1fr\)/);
});

test("identity, workload, distributions and actions remain visible", () => {
  for (const label of [
    "Tarefas abertas",
    "Processos",
    "Monitoramentos",
    "Distribuição de tarefas",
    "Atendimentos do portal",
    "Configurar distribuição",
    "Configurar atendimento",
  ]) {
    assert.match(page, new RegExp(label));
  }
});
