import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const central = readFileSync("src/routes/_authenticated/central.tsx", "utf8");
const sidebar = readFileSync("src/components/layout/app-sidebar.tsx", "utf8");
const header = readFileSync("src/components/layout/app-header.tsx", "utf8");
const shell = readFileSync("src/routes/_authenticated.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

test("Central de Comando usa identidade visual profissional", () => {
  assert.match(central, /bg-gradient-to-br from-slate-950/);
  assert.match(central, /Visão operacional/);
  assert.match(central, /Tudo em dia/);
  assert.match(central, /group-hover:-translate-y-0\.5/);
  assert.match(central, /rounded-3xl/);
  assert.match(central, /shadow-panel/);
});

test("títulos dos indicadores ficam completos e estados zerados são positivos", () => {
  for (const label of ["Retornos atrasados", "Documentos vencendo", "Próximos vencimentos"]) {
    assert.ok(central.includes(`"${label}"`), label);
  }
  assert.match(central, /min-h-8 text-xs leading-4/);
  assert.doesNotMatch(central, /<p className="truncate text-xs font-medium tracking-wide/);
  assert.match(central, /text-emerald-700 dark:text-emerald-300/);
  assert.match(central, /CheckCircle2/);
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
  assert.match(sidebar, /data-\[active=true\]:bg-blue-500\/15/);
});

test("estrutura interna usa navegação e cabeçalho premium", () => {
  assert.match(sidebar, /variant="inset"/);
  assert.match(sidebar, /bg-gradient-to-br from-blue-500 to-blue-600/);
  assert.match(styles, /--sidebar: oklch\(0\.18 0\.02 258\)/);
  assert.match(header, /backdrop-blur-xl/);
  assert.match(header, /bg-gradient-to-r from-blue-600 to-blue-500/);
  assert.match(shell, /bg-sidebar/);
  assert.match(shell, /bg-muted\/20/);
});
