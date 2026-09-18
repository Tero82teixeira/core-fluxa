import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("acabamento premium da gestão e dos relatórios", () => {
  test("Comunicação organiza relacionamento, indicadores e filtros em superfícies responsivas", async () => {
    const communication = await read("../src/routes/_authenticated/comunicacao.tsx");

    assert.match(communication, /max-w-\[1600px\] space-y-6 p-4 sm:p-6 lg:p-8/);
    assert.match(communication, /Relacionamento ativo/);
    assert.match(communication, /from-slate-950 via-slate-900 to-sky-950/);
    assert.match(communication, /Busca e filtros/);
    assert.match(communication, /<PortalServiceCenter/);
    assert.match(communication, /<CallbackRequestsPanel/);
    assert.match(communication, /Nova conversa/);
  });

  test("Financeiro preserva ações e leitura de saldo no novo painel premium", async () => {
    const finance = await read("../src/routes/_authenticated/financeiro.tsx");

    assert.match(finance, /Controle financeiro/);
    assert.match(finance, /from-slate-950 via-slate-900 to-emerald-950/);
    assert.match(finance, /Saldo \{brl\(currentBalance\)\}/);
    assert.match(finance, /Resultado do mês \{brl\(monthIncome - monthExpense\)\}/);
    assert.match(finance, /Imprimir \/ PDF/);
    assert.match(finance, /<TransactionDialog/);
    assert.match(finance, /rounded-2xl border border-border\/70 bg-card p-2 shadow-soft/);
  });

  test("Relatórios combina inteligência, filtros e exportação sem perder as visões existentes", async () => {
    const reports = await read("../src/routes/_authenticated/relatorios.tsx");

    assert.match(reports, /reports-page mx-auto w-full max-w-\[1600px\]/);
    assert.match(reports, /Inteligência gerencial/);
    assert.match(reports, /from-slate-950 via-slate-900 to-indigo-950/);
    assert.match(reports, /Filtros do relatório/);
    assert.match(reports, /Escolha o relatório que deseja visualizar/);
    assert.match(reports, /Exportar relatório atual/);
    assert.match(reports, /reportTabs\.find\(\(\[value\]\) => value === tab\)/);
  });
});
