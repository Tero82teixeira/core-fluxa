import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const onboardingPath = new URL("../src/routes/_authenticated/onboarding.tsx", import.meta.url);

describe("primeira experiência do cliente", () => {
  test("explica que a configuração libera os módulos e pode ser editada depois", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.match(onboarding, /Vamos preparar o FLUXA para a sua área/);
    assert.match(onboarding, /poderá revisar essas escolhas em Configurações/);
    assert.match(onboarding, /Qual é a área principal da sua empresa ou atuação/);
    assert.match(onboarding, /O que melhor descreve sua operação/);
    assert.match(onboarding, /Nome fantasia \*/);
    assert.match(onboarding, /Campo obrigatório/);
  });

  test("permite explorar depois de definir segmento e tipo de operação", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.match(onboarding, /Explorar o FLUXA agora/);
    assert.match(onboarding, /start_organization_exploration/);
    assert.match(onboarding, /step > 1 && step < 5/);
    assert.match(onboarding, /Concluir configuração e entrar/);
  });

  test("entra na área escolhida somente depois de concluir a RPC protegida", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.match(
      onboarding,
      /updateOnboarding\(\{ step: 3, complete: true \}\);[\s\S]*refreshWorkspace\(\);[\s\S]*segment === "health"[\s\S]*healthWorkspaceHome[\s\S]*: "\/meu-dia"/,
    );
    assert.match(onboarding, /aria-current=\{index === step \? "step" : undefined\}/);
  });
});
