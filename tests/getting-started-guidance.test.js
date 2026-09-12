import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guide = readFileSync(
  "src/components/onboarding/getting-started-card.tsx",
  "utf8",
);
const myDay = readFileSync("src/routes/_authenticated/meu-dia.tsx", "utf8");
const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const sidebar = readFileSync("src/components/layout/app-sidebar.tsx", "utf8");
const header = readFileSync("src/components/layout/app-header.tsx", "utf8");

test("Meu Dia presents a real five-step setup sequence to managers", () => {
  assert.match(myDay, /<GettingStartedCard \/>/);
  for (const label of [
    "Complete os dados da empresa",
    "Cadastre o primeiro cliente",
    "Convide sua equipe",
    "Prepare o financeiro",
    "Conecte o Asaas",
  ]) {
    assert.match(guide, new RegExp(label));
  }
  assert.match(guide, /steps\.filter\(\(step\) => step\.complete\)\.length/);
  assert.match(guide, /\$\{completed\} de \$\{steps\.length\} etapas concluídas/);
});

test("setup progress comes from tenant data and keeps optional services non-blocking", () => {
  assert.match(guide, /countRows\("clients", organizationId!\)/);
  assert.match(guide, /countRows\("organization_members", organizationId!\)/);
  assert.match(guide, /countRows\("financial_accounts", organizationId!\)/);
  assert.match(guide, /asaas\.data\?\.status === "connected"/);
  assert.match(guide, /optional: true,[\s\S]*icon: UsersRound/);
  assert.match(guide, /optional: true,[\s\S]*icon: CreditCard/);
  assert.match(guide, /filter\(\(step\) => !step\.optional\)\.every/);
});

test("the guide can be hidden and resumed for the same user and company", () => {
  assert.match(guide, /fluxa-getting-started:\$\{user\?\.id/);
  assert.match(guide, /localStorage\.setItem\(storageKey, "collapsed"\)/);
  assert.match(guide, /Ocultar por agora/);
  assert.match(guide, /Continuar/);
});

test("the sidebar removes advanced modules from operational profiles", () => {
  assert.match(sidebar, /navItemVisibleForRole\(item\.to, role\)/);
  assert.match(
    navigation,
    /operacional: \[[\s\S]*?"\/comunicacao"[\s\S]*?"\/notificacoes"[\s\S]*?"\/ajuda"[\s\S]*?\]/,
  );
  const operational = navigation.match(/operacional: \[([\s\S]*?)\],\n  atendimento:/)?.[1] ?? "";
  for (const hidden of ["/financeiro", "/relatorios", "/equipe", "/automacoes", "/configuracoes", "/assinatura"]) {
    assert.doesNotMatch(operational, new RegExp(hidden));
  }
});

test("owners and administrators preserve the complete navigation", () => {
  assert.match(
    navigation,
    /role === "superadmin" \|\| role === "proprietario" \|\| role === "administrador"/,
  );
  assert.match(navigation, /return true;/);
});


test("quick-create actions also respect operational responsibility", () => {
  assert.match(header, /visible: can\("clients\.create"\)/);
  assert.match(header, /visible: can\("processes\.create"\)/);
  assert.match(header, /visible: financeRole/);
  assert.match(header, /filter\(\(action\) => action\.visible\)/);
});
