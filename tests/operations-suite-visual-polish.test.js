import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tasks = readFileSync("src/routes/_authenticated/tarefas.tsx", "utf8");
const documents = readFileSync("src/routes/_authenticated/documentos.tsx", "utf8");
const documentList = readFileSync("src/components/documents/document-list.tsx", "utf8");
const monitoring = readFileSync("src/routes/_authenticated/monitoramento.tsx", "utf8");
const processes = readFileSync("src/routes/_authenticated/processos.index.tsx", "utf8");

test("Tarefas reúne contexto, indicadores e filtros sem remover suas três visões", () => {
  assert.match(tasks, /Execução organizada/);
  assert.match(tasks, /Visão, busca e filtros/);
  assert.match(tasks, /from-slate-950 via-slate-900 to-amber-950/);
  assert.match(tasks, />\s*Lista\s*</);
  assert.match(tasks, />\s*Quadro\s*</);
  assert.match(tasks, />\s*Agenda\s*</);
});

test("Documentos moderniza acervo, busca e cartões preservando ações", () => {
  assert.match(documents, /Acervo inteligente/);
  assert.match(documents, /Busca e filtros/);
  assert.match(documents, /from-slate-950 via-slate-900 to-cyan-950/);
  assert.match(documents, /Enviar documento/);
  assert.match(documentList, /rounded-2xl border border-border\/70/);
  assert.match(documentList, />\s*Abrir\s*</);
});

test("Monitoramento destaca riscos e mantém filtros e acompanhamento", () => {
  assert.match(monitoring, /Vigilância operacional/);
  assert.match(monitoring, /Busca e filtros/);
  assert.match(monitoring, /from-slate-950 via-slate-900 to-rose-950/);
  assert.match(monitoring, /Status do acompanhamento/);
  assert.match(monitoring, /Abrir registro original/);
});

test("seletor de Processos evita sobreposição entre Quadro e Lista", () => {
  assert.match(processes, /grid w-full min-w-0 grid-cols-2/);
  assert.match(processes, /sm:w-60 sm:shrink-0/);
  assert.match(processes, /min-w-0 whitespace-nowrap rounded-lg/);
});

test("cabeçalho de Processos preserva a proporção em larguras intermediárias", () => {
  assert.match(processes, /gap-4 xl:flex-row xl:items-end xl:justify-between/);
  assert.match(processes, /min-w-0 xl:flex-1/);
  assert.match(processes, /sm:justify-end xl:w-auto xl:shrink-0/);
  assert.doesNotMatch(processes, /gap-5 lg:flex-row lg:items-end lg:justify-between/);
});
