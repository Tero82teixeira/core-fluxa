import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const layout = readFileSync("src/routes/_authenticated.tsx", "utf8");
const onboarding = readFileSync(
  "src/components/notifications/push-notification-onboarding.tsx",
  "utf8",
);
const settings = readFileSync(
  "src/components/notifications/push-notification-settings.tsx",
  "utf8",
);

test("notificações possuem acesso direto no menu lateral", () => {
  assert.match(navigation, /to: "\/notificacoes", label: "Notificações"/);
});

test("aparelho novo recebe convite de ativação após o workspace ficar pronto", () => {
  assert.match(layout, /<PushNotificationOnboarding/);
  assert.match(onboarding, /Receba alertas de novos atendimentos/);
  assert.match(onboarding, /push\.permission === "denied"/);
  assert.match(onboarding, /sessionStorage/);
});

test("ativação guiada confirma a inscrição e tenta entregar um alerta de teste", () => {
  assert.match(onboarding, /await push\.enable\(\)/);
  assert.match(onboarding, /await push\.test\(\)/);
  assert.match(onboarding, /Alertas ativados neste aparelho/);
  assert.match(settings, /Alertas ativados e teste enviado para este aparelho/);
});
