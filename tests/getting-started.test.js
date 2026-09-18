import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const central = readFileSync("src/routes/_authenticated/central.tsx", "utf8");
const card = readFileSync("src/components/getting-started-card.tsx", "utf8");
const hook = readFileSync("src/hooks/use-getting-started.ts", "utf8");

test("Central mostra primeiros passos somente ao proprietário", () => {
  assert.match(central, /useGettingStarted\(organizationId, role === "proprietario"\)/);
  assert.match(central, /role === "proprietario" && gettingStarted\.data/);
  assert.match(central, /<GettingStartedCard progress=\{gettingStarted\.data\}/);
});

test("checklist acompanha ações reais da operação", () => {
  for (const label of [
    "Empresa configurada",
    "Cadastre o primeiro cliente",
    "Crie o primeiro processo",
    "Planeje a primeira tarefa",
  ]) {
    assert.ok(card.includes(label), label);
  }
  assert.match(card, /progress\.clients > 0/);
  assert.match(card, /progress\.processes > 0/);
  assert.match(card, /progress\.tasks > 0/);
  assert.match(card, /if \(!next\) return null/);
  assert.match(card, /step\.done \?/);
  assert.doesNotMatch(card, /to="\/onboarding"/);
});

test("contagens são isoladas pela empresa e não carregam listas completas", () => {
  for (const table of ["clients", "processes", "tasks", "organization_members"]) {
    assert.ok(hook.includes(`countRows("${table}", organizationId)`), table);
  }
  assert.match(hook, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(hook, /eq\("organization_id", organizationId\)/);
});

test("convite de equipe é opcional", () => {
  assert.match(card, /progress\.team <= 1/);
  assert.match(card, /O convite é opcional/);
  assert.match(card, /to="\/equipe"/);
});
