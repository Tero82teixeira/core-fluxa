import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const memory = read("../src/hooks/use-filter-memory.ts");
const unsaved = read("../src/hooks/use-unsaved-changes.ts");
const activeFilters = read("../src/components/shared/active-filters.tsx");
const clients = read("../src/routes/_authenticated/clientes.index.tsx");
const processes = read("../src/routes/_authenticated/processos.index.tsx");
const clientForm = read("../src/components/clients/client-form.tsx");
const newProcess = read("../src/routes/_authenticated/processos.novo.tsx");

test("memória de filtros permanece limitada à sessão e ao escopo informado", () => {
  assert.match(memory, /fluxa:filters:/);
  assert.match(memory, /window\.sessionStorage\.getItem/);
  assert.match(memory, /window\.sessionStorage\.setItem/);
  assert.match(memory, /window\.sessionStorage\.removeItem/);
  assert.match(clients, /clients:\$\{organizationId \?\? "none"\}/);
  assert.match(processes, /processes:\$\{organizationId \?\? "none"\}/);
});

test("clientes e processos restauram filtros, página e visualização", () => {
  for (const route of [clients, processes]) {
    assert.match(route, /useFilterMemory/);
    assert.match(route, /remembered\.page/);
    assert.match(route, /setPage\(remembered\.page\)/);
    assert.match(route, /ActiveFilters/);
    assert.match(route, /clearRememberedFilters/);
  }
  assert.match(clients, /remembered\.term/);
  assert.match(clients, /remembered\.archived/);
  assert.match(processes, /remembered\.view/);
  assert.match(processes, /setView/);
});

test("resumo de filtros informa a quantidade e oferece limpeza", () => {
  assert.match(activeFilters, /filtro ativo/);
  assert.match(activeFilters, /filtros ativos/);
  assert.match(activeFilters, /Limpar filtros/);
  assert.match(activeFilters, /aria-live="polite"/);
});

test("formulários avisam antes de perder alterações não salvas", () => {
  assert.match(unsaved, /useBlocker/);
  assert.match(unsaved, /window\.confirm/);
  assert.match(unsaved, /enableBeforeUnload/);
  assert.match(clientForm, /useUnsavedChanges\(isDirty\)/);
  assert.match(clientForm, /Alterações não salvas/);
  assert.match(newProcess, /useUnsavedChanges\(isDirty\)/);
  assert.match(newProcess, /markSaved\(\);[\s\S]*navigate/);
});
