import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const myDay = readFileSync("src/routes/_authenticated/meu-dia.tsx", "utf8");
const clients = readFileSync("src/routes/_authenticated/clientes.index.tsx", "utf8");
const processes = readFileSync("src/routes/_authenticated/processos.index.tsx", "utf8");

test("Meu Dia usa hierarquia premium sem remover a fila operacional", () => {
  assert.match(myDay, /from-slate-950 via-slate-900 to-amber-950/);
  assert.match(myDay, /Fila de prioridades/);
  assert.match(myDay, /shadow-panel/);
  assert.match(myDay, /Tudo em dia/);
});

test("Clientes reúne contexto, busca e filtros em superfícies modernas", () => {
  assert.match(clients, /Carteira de relacionamento/);
  assert.match(clients, /Busca e filtros/);
  assert.match(clients, /from-slate-950 via-slate-900 to-blue-950/);
  assert.match(clients, /md:hidden/);
});

test("Processos mantém quadro e lista com acabamento premium", () => {
  assert.match(processes, /Fluxo operacional/);
  assert.match(processes, />\s*Quadro\s*</);
  assert.match(processes, />\s*Lista\s*</);
  assert.match(processes, /from-slate-950 via-slate-900 to-violet-950/);
  assert.match(processes, /onDragStart/);
});
