import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const central = readFileSync("src/routes/_authenticated/central.tsx", "utf8");
const sidebar = readFileSync("src/components/layout/app-sidebar.tsx", "utf8");

test("Central de Comando usa identidade visual profissional", () => {
  assert.match(central, /bg-gradient-to-br from-primary/);
  assert.match(central, /Visão operacional/);
  assert.match(central, /Tudo em dia/);
  assert.match(central, /group-hover:-translate-y-0\.5/);
});

test("indicadores e blocos possuem cores e ícones por categoria", () => {
  for (const tone of ["blue", "amber", "rose", "orange", "cyan", "violet", "emerald", "indigo"]) {
    assert.match(central, new RegExp(`${tone}: \\{`));
  }
  for (const title of [
    "Precisa de atenção",
    "Alertas do Monitoramento",
    "Tarefas",
    "Processos",
    "Financeiro",
    "Retornos e comunicação",
    "Documentos",
  ]) {
    assert.ok(central.includes(`title="${title}"`), title);
  }
});

test("menu lateral diferencia visualmente todos os módulos", () => {
  for (const route of [
    "/central",
    "/clientes",
    "/processos",
    "/documentos",
    "/monitoramento",
    "/tarefas",
    "/comunicacao",
    "/financeiro",
    "/relatorios",
    "/equipe",
    "/automacoes",
    "/configuracoes",
    "/ajuda",
    "/novidades",
  ]) {
    assert.ok(sidebar.includes(`"${route}":`), route);
  }
  assert.match(sidebar, /data-\[active=true\]:bg-sidebar-primary\/10/);
});
