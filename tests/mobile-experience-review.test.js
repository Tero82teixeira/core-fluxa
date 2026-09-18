import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("revisão completa da experiência no celular", () => {
  test("modais e painéis globais permanecem dentro da viewport móvel", async () => {
    const [dialog, alertDialog, sheet] = await Promise.all([
      read("../src/components/ui/dialog.tsx"),
      read("../src/components/ui/alert-dialog.tsx"),
      read("../src/components/ui/sheet.tsx"),
    ]);

    for (const content of [dialog, alertDialog]) {
      assert.match(content, /max-h-\[calc\(100dvh-2rem\)\]/);
      assert.match(content, /w-\[calc\(100%-2rem\)\]/);
      assert.match(content, /overflow-y-auto/);
    }
    assert.match(sheet, /h-dvh w-\[min\(22rem,calc\(100vw-2rem\)\)\]/);
    assert.match(sheet, /overflow-y-auto/);
  });

  test("listas de clientes e processos trocam tabelas por cartões no celular", async () => {
    const [clients, processes] = await Promise.all([
      read("../src/routes/_authenticated/clientes.index.tsx"),
      read("../src/routes/_authenticated/processos.index.tsx"),
    ]);

    assert.match(clients, /<Card className="hidden [^"]*md:block">/);
    assert.match(clients, /className="grid gap-3 md:hidden"/);
    assert.match(processes, /<Card className="hidden [^"]*md:block">/);
    assert.match(processes, /className="grid gap-3 md:hidden"/);
    assert.match(processes, /Cliente não informado/);
  });

  test("tarefas oferece controles fluidos e ações grandes no celular", async () => {
    const tasks = await read("../src/routes/_authenticated/tarefas.tsx");

    assert.match(tasks, /grid h-auto w-full grid-cols-3/);
    assert.match(tasks, /w-full lg:w-44/);
    assert.match(tasks, /grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
    assert.match(tasks, /className="w-full sm:w-auto"[\s\S]*?>\s*Salvar tarefa/);
    assert.match(tasks, /grid gap-2 sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
  });

  test("fichas internas usam abas roláveis sem comprimir rótulos", async () => {
    const [client, process] = await Promise.all([
      read("../src/routes/_authenticated/clientes.$clientId.tsx"),
      read("../src/routes/_authenticated/processos.$processId.tsx"),
    ]);

    for (const content of [client, process]) {
      assert.match(content, /max-w-full justify-start gap-1\.5 overflow-x-auto/);
      assert.match(content, /shrink-0 px-4 py-2 text-sm/);
    }
  });

  test("portal e administração evitam tabelas e navegação comprimidas no celular", async () => {
    const [portal, administration] = await Promise.all([
      read("../src/routes/meu-portal.tsx"),
      read("../src/routes/_authenticated/administracao-plataforma.tsx"),
    ]);

    assert.match(portal, /flex h-auto w-full justify-start gap-1 overflow-x-auto/);
    assert.match(portal, /sm:grid sm:grid-cols-4 sm:overflow-visible/);
    assert.match(administration, /className="grid gap-3 p-3 lg:hidden"/);
    assert.match(administration, /className="hidden overflow-x-auto lg:block"/);
    assert.match(administration, /<CommercialActions/);
  });

  test("Central e Financeiro preservam os padrões móveis já aprovados", async () => {
    const [central, finance] = await Promise.all([
      read("../src/routes/_authenticated/central.tsx"),
      read("../src/routes/_authenticated/financeiro.tsx"),
    ]);

    assert.match(central, /max-w-7xl space-y-6 p-4 sm:p-6/);
    assert.match(central, /grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4/);
    assert.match(finance, /finance-page mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6/);
    assert.match(finance, /className="space-y-3 lg:hidden"/);
    assert.match(finance, /className="hidden overflow-x-auto lg:block"/);
  });

  test("formulários principais deixam ações ocuparem a largura disponível", async () => {
    const [clientForm, newClient, editClient, newProcess] = await Promise.all([
      read("../src/components/clients/client-form.tsx"),
      read("../src/routes/_authenticated/clientes.novo.tsx"),
      read("../src/routes/_authenticated/clientes.$clientId_.editar.tsx"),
      read("../src/routes/_authenticated/processos.novo.tsx"),
    ]);

    assert.match(clientForm, /grid gap-2 sm:flex sm:flex-wrap/);
    assert.match(clientForm, /w-full sm:w-auto/);
    assert.match(newClient, /p-4 sm:p-6/);
    assert.match(editClient, /p-4 sm:p-6/);
    assert.match(newProcess, /grid gap-2 sm:col-span-2 sm:flex/);
  });
});
