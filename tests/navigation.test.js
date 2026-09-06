import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const itemPattern =
  /\{\s*to: "([^"]+)",\s*label: "([^"]+)",\s*icon: \w+,\s*description: "[^"]+",\s*ready: (true|false),\s*group: "(\w+)",?\s*\}/g;
const items = [...navigation.matchAll(itemPattern)].map(([, to, label, ready, group]) => ({
  to,
  label,
  ready: ready === "true",
  group,
}));

const byLabel = (label) => items.find((item) => item.label === label);

describe("status dos módulos na navegação lateral", () => {
  test("Configurações mantém a rota e não exibe o indicador em breve", () => {
    assert.deepEqual(byLabel("Configurações"), {
      to: "/configuracoes",
      label: "Configurações",
      ready: true,
      group: "sistema",
    });
  });

  test("Ajuda e suporte mantém a rota e não exibe o indicador em breve", () => {
    assert.deepEqual(byLabel("Ajuda e suporte"), {
      to: "/ajuda",
      label: "Ajuda e suporte",
      ready: true,
      group: "sistema",
    });
  });

  test("Novidades continua sem o indicador em breve", () => {
    assert.deepEqual(byLabel("Novidades"), {
      to: "/novidades",
      label: "Novidades",
      ready: true,
      group: "sistema",
    });
  });

  test("preserva os demais itens, rotas, grupos e status", () => {
    assert.deepEqual(
      items.filter(({ label }) => !["Configurações", "Ajuda e suporte"].includes(label)),
      [
        { to: "/meu-dia", label: "Meu Dia", ready: true, group: "operacao" },
        { to: "/central", label: "Central de Comando", ready: true, group: "operacao" },
        { to: "/clientes", label: "Clientes", ready: true, group: "operacao" },
        { to: "/processos", label: "Processos", ready: true, group: "operacao" },
        { to: "/documentos", label: "Documentos", ready: true, group: "operacao" },
        { to: "/monitoramento", label: "Monitoramento", ready: true, group: "operacao" },
        { to: "/tarefas", label: "Tarefas", ready: true, group: "operacao" },
        { to: "/comunicacao", label: "Comunicação", ready: true, group: "gestao" },
        { to: "/financeiro", label: "Financeiro", ready: true, group: "gestao" },
        { to: "/relatorios", label: "Relatórios", ready: true, group: "gestao" },
        { to: "/equipe", label: "Equipe", ready: true, group: "gestao" },
        { to: "/automacoes", label: "Automações", ready: true, group: "gestao" },
        { to: "/assinatura", label: "Minha assinatura", ready: true, group: "sistema" },
        { to: "/novidades", label: "Novidades", ready: true, group: "sistema" },
      ],
    );
  });
});
