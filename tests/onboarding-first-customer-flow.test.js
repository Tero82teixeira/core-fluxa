import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const onboardingPath = new URL("../src/routes/_authenticated/onboarding.tsx", import.meta.url);

describe("primeira experiência do cliente", () => {
  test("explica que a configuração libera os módulos e pode ser editada depois", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.match(onboarding, /Antes de entrar no sistema/);
    assert.match(onboarding, /Qual é a sua área de atuação/);
    assert.match(onboarding, /Cadastrar minha empresa/);
    assert.match(onboarding, /revisar essas informações em Configurações/);
    assert.match(onboarding, /Nome fantasia \*/);
    assert.match(onboarding, /Campo obrigatório/);
  });

  test("exige cadastrar a empresa antes de abrir os menus", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.doesNotMatch(onboarding, /Explorar o FLUXA agora/);
    assert.match(onboarding, /step < 2/);
    assert.match(onboarding, /update_organization_segment/);
    assert.match(onboarding, /Concluir configuração e entrar/);
  });

  test("entra na área escolhida somente depois de concluir a RPC protegida", async () => {
    const onboarding = await readFile(onboardingPath, "utf8");

    assert.match(
      onboarding,
      /updateOnboarding\(\{ step: 3, complete: true \}\);[\s\S]*refreshWorkspace\(\);[\s\S]*workspaceHomeForSegment/,
    );
    assert.match(onboarding, /aria-current=\{index \+ 2 === step \? "step" : undefined\}/);
  });
});
