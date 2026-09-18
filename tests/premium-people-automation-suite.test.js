import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("acabamento premium de pessoas, automações e avisos", () => {
  test("Equipe destaca capacidade, convites e filtros sem remover a gestão operacional", async () => {
    const team = await read("../src/routes/_authenticated/equipe.tsx");

    assert.match(team, /max-w-\[1600px\] space-y-6 p-4 sm:p-6 lg:p-8/);
    assert.match(team, /Gestão de pessoas/);
    assert.match(team, /from-slate-950 via-slate-900 to-blue-950/);
    assert.match(team, /Busca e filtros/);
    assert.match(team, /de \{TEAM_MEMBER_LIMIT\} vagas usadas/);
    assert.match(team, /Configurar distribuição/);
    assert.match(team, /Transferir responsabilidades/);
  });

  test("Automações apresenta saúde das regras e mantém as duas formas de criação", async () => {
    const automations = await read("../src/routes/_authenticated/automacoes.tsx");

    assert.match(automations, /Operação inteligente/);
    assert.match(automations, /from-slate-950 via-slate-900 to-violet-950/);
    assert.match(automations, /Nova por evento/);
    assert.match(automations, /Nova por horário/);
    assert.match(automations, /\{failed\} falha\(s\) recente\(s\)/);
    assert.match(automations, /Busca e filtros/);
    assert.match(automations, /Visualizar histórico/);
  });

  test("Notificações prioriza pendências e preserva leitura, filtro e paginação", async () => {
    const notifications = await read("../src/routes/_authenticated/notificacoes.tsx");

    assert.match(notifications, /Central de avisos/);
    assert.match(notifications, /from-slate-950 via-slate-900 to-rose-950/);
    assert.match(notifications, /\{unread\} não lida\(s\)/);
    assert.match(notifications, /Filtrar notificações/);
    assert.match(notifications, /Marcar todas como lidas/);
    assert.match(notifications, /Carregar mais/);
    assert.match(notifications, /<PushNotificationSettings/);
  });
});
