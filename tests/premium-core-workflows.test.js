import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const clientDetail = read("src/routes/_authenticated/clientes.$clientId.tsx");
const newClient = read("src/routes/_authenticated/clientes.novo.tsx");
const editClient = read("src/routes/_authenticated/clientes.$clientId_.editar.tsx");
const clientForm = read("src/components/clients/client-form.tsx");
const processDetail = read("src/routes/_authenticated/processos.$processId.tsx");
const newProcess = read("src/routes/_authenticated/processos.novo.tsx");
const onboarding = read("src/routes/_authenticated/onboarding.tsx");
const updates = read("src/routes/_authenticated/novidades.tsx");

describe("acabamento premium dos fluxos centrais", () => {
  test("cliente reúne visão 360, ações e formulários responsivos", () => {
    assert.match(clientDetail, /Relacionamento 360°/);
    assert.match(clientDetail, /max-w-\[1600px\]/);
    assert.match(clientDetail, /to-cyan-950/);
    assert.match(clientDetail, /Novo processo/);
    assert.match(clientDetail, /Portal do Cliente/);
    assert.match(newClient, /Nova relação/);
    assert.match(newClient, /Informações do cliente/);
    assert.match(editClient, /Atualização cadastral/);
    assert.match(editClient, /Dados do relacionamento/);
    assert.match(clientForm, /rounded-2xl border border-border\/70 bg-muted\/10/);
  });

  test("processo mantém etapa, movimentação, checklist e criação guiada", () => {
    assert.match(processDetail, /Fluxo operacional/);
    assert.match(processDetail, /max-w-\[1600px\]/);
    assert.match(processDetail, /Registrar movimentação/);
    assert.match(processDetail, /Checklist operacional/);
    assert.match(newProcess, /Novo fluxo operacional/);
    assert.match(newProcess, /Informações do processo/);
    assert.match(newProcess, /checklist automaticamente/);
    assert.match(newProcess, /Criar processo/);
  });

  test("escolha de área separada e cadastro da empresa mostram progresso próprio", () => {
    assert.match(onboarding, /Primeiros passos/);
    assert.match(onboarding, /Seu progresso/);
    assert.match(onboarding, /Antes de entrar no sistema/);
    assert.match(onboarding, /Etapa \{step - 1\} de \{STEPS\.length - 2\}/);
    assert.match(onboarding, /sm:grid-cols-4/);
    assert.match(onboarding, /Concluir configuração e entrar/);
  });

  test("filtros de Novidades não escapam do cabeçalho em larguras intermediárias", () => {
    assert.match(updates, /grid min-w-0/);
    assert.match(updates, /sm:grid-cols-2 xl:grid-cols-/);
    assert.doesNotMatch(updates, /sm:grid-cols-2 lg:grid-cols-\[minmax\(240px/);
    assert.match(updates, /className="min-w-0"/);
    assert.match(updates, /w-full min-w-0 rounded-xl/);
    assert.match(updates, /Todos os módulos/);
  });
});
