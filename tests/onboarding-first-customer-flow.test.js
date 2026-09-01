import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const onboardingPath = new URL("../src/routes/_authenticated/onboarding.tsx", import.meta.url);

describe("primeira experiência do cliente", () => {
  test("explica que a configuração libera os módulos e pode ser editada depois", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.match(onboarding, /Conclua estas quatro etapas rápidas para liberar os módulos/);
    assert.match(onboarding, /poderá alterar[\s\S]*dados em Configurações/);
    assert.match(onboarding, /Nome fantasia \*/);
    assert.match(onboarding, /Campo obrigatório/);
  });

  test("não oferece uma saída que o guard redirecionaria de volta", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.doesNotMatch(onboarding, /Concluir depois/);
    assert.doesNotMatch(onboarding, /step < 3[\s\S]*navigate\(\{ to: "\/central"/);
    assert.match(onboarding, /Concluir configuração e entrar/);
  });

  test("entra na Central somente depois de concluir a RPC protegida", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.match(
      onboarding,
      /updateOnboarding\(\{ step: 3, complete: true \}\);[\s\S]*refreshWorkspace\(\);[\s\S]*navigate\(\{ to: "\/central" \}\)/,
    );
    assert.match(onboarding, /aria-current=\{index === step \? "step" : undefined\}/);
  });
});
