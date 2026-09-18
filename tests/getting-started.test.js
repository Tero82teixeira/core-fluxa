import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const central = readFileSync("src/routes/_authenticated/central.tsx", "utf8");
const card = readFileSync("src/components/onboarding/getting-started-card.tsx", "utf8");

test("Central usa o mesmo guia de primeiros passos do Meu Dia", () => {
  assert.match(central, /components\/onboarding\/getting-started-card/);
  assert.match(central, /<GettingStartedCard \/>/);
  assert.doesNotMatch(central, /useGettingStarted/);
});

test("checklist acompanha ações reais da operação", () => {
  for (const label of [
    "Complete os dados da empresa",
    "Cadastre o primeiro cliente",
    "Crie o primeiro processo",
    "Adicione o primeiro documento",
    "Planeje a primeira tarefa",
  ]) {
    assert.ok(card.includes(label), label);
  }
  assert.match(card, /status\.data\?\.clients/);
  assert.match(card, /status\.data\?\.processes/);
  assert.match(card, /status\.data\?\.documents/);
  assert.match(card, /status\.data\?\.tasks/);
  assert.match(card, /step\.complete \?/);
});

test("contagens são isoladas pela empresa e não carregam listas completas", () => {
  for (const table of [
    "clients",
    "processes",
    "documents",
    "tasks",
    "organization_members",
    "financial_accounts",
  ]) {
    assert.ok(card.includes(`countRows("${table}", organizationId!)`), table);
  }
  assert.match(card, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(card, /eq\("organization_id", organizationId\)/);
});

test("convite de equipe é opcional", () => {
  assert.match(card, /status\.data\?\.members/);
  assert.match(card, /optional: true,[\s\S]*icon: UsersRound/);
  assert.match(card, /to: "\/equipe"/);
});
