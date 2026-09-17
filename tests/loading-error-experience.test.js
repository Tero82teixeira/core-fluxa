import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const asyncState = read("../src/components/shared/async-state.tsx");
const clients = read("../src/routes/_authenticated/clientes.index.tsx");
const processes = read("../src/routes/_authenticated/processos.index.tsx");
const tasks = read("../src/routes/_authenticated/tarefas.tsx");
const notifications = read("../src/routes/_authenticated/notificacoes.tsx");
const documents = read("../src/routes/_authenticated/documentos.tsx");
const monitoring = read("../src/routes/_authenticated/monitoramento.tsx");

test("estado assíncrono compartilhado comunica carregamento, erro e nova tentativa", () => {
  assert.match(asyncState, /role="status"/);
  assert.match(asyncState, /aria-live="polite"/);
  assert.match(asyncState, /role="alert"/);
  assert.match(asyncState, /disabled=\{retrying\}/);
  assert.match(asyncState, /Tentar novamente/);
});

test("clientes, processos e tarefas exibem erro recuperável", () => {
  assert.match(clients, /query\.isError/);
  assert.match(clients, /query\.refetch\(\)/);
  assert.match(processes, /board\.isError/);
  assert.match(processes, /board\.refetch\(\)/);
  assert.match(processes, /list\.isError/);
  assert.match(processes, /list\.refetch\(\)/);
  assert.match(tasks, /tasks\.isError/);
  assert.match(tasks, /tasks\.refetch\(\)/);
});

test("notificações, documentos e monitoramento permitem tentar novamente", () => {
  for (const route of [notifications, documents, monitoring]) {
    assert.match(route, /ErrorState/);
    assert.match(route, /\.refetch\(\)/);
    assert.match(route, /isFetching/);
  }
  assert.match(notifications, /EmptyState/);
  assert.match(notifications, /Troque o filtro/);
});

test("ações mutáveis bloqueiam cliques repetidos", () => {
  assert.match(tasks, /if \(changeStatus\.isPending\) return/);
  assert.match(tasks, /disabled=\{!permissions\.canManageTasks \|\| changeStatus\.isPending\}/);
  assert.match(tasks, /disabled=\{archive\.isPending\}/);
  assert.match(tasks, /disabled=\{statusPending\}/);
  assert.match(notifications, /if \(mark\.isPending\) return/);
  assert.match(notifications, /disabled=\{mark\.isPending\}/);
});
