import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("acabamento responsivo dos painéis internos", () => {
  test("assinatura preserva palavras inteiras e só usa quatro colunas em telas amplas", async () => {
    const subscription = await read("../src/routes/_authenticated/assinatura.tsx");

    assert.match(subscription, /sm:grid-cols-2 2xl:grid-cols-4/);
    assert.match(subscription, /break-normal/);
    assert.match(subscription, /\[overflow-wrap:normal\]/);
    assert.doesNotMatch(subscription, /md:grid-cols-2 lg:grid-cols-4/);
  });

  test("atalhos da Central ganham espaço progressivamente e permitem texto legível", async () => {
    const central = await read("../src/routes/_authenticated/central.tsx");

    assert.match(central, /sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5/);
    assert.match(central, /whitespace-normal text-center leading-tight/);
    assert.doesNotMatch(central, /pt-4 sm:grid-cols-2 lg:grid-cols-5/);
  });

  test("conteúdo reserva área para o atendimento flutuante", async () => {
    const layout = await read("../src/routes/_authenticated.tsx");

    assert.match(layout, /flex-1 pb-24 sm:pb-28/);
  });

  test("indicadores usam o mesmo tamanho moderado de 24 pixels", async () => {
    const [styles, central, reports, team, tasks] = await Promise.all([
      read("../src/styles.css"),
      read("../src/routes/_authenticated/central.tsx"),
      read("../src/routes/_authenticated/relatorios.tsx"),
      read("../src/routes/_authenticated/equipe.tsx"),
      read("../src/routes/_authenticated/tarefas.tsx"),
    ]);

    assert.match(styles, /@utility metric-value[\s\S]*font-size: 1\.5rem/);
    assert.match(central, /text-2xl leading-none font-semibold tabular-nums/);
    assert.match(reports, /className="metric-value"/);
    assert.match(team, /text-2xl font-semibold/);
    assert.match(tasks, /className="metric-value mt-2"/);
    assert.doesNotMatch(central, /text-3xl leading-none font-semibold tabular-nums/);
  });
});
