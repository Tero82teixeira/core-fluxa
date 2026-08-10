import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  GLOBAL_SEARCH_LIMIT,
  GLOBAL_SEARCH_MODULE_LIMIT,
  composeGlobalSearchResults,
  normalizeSearchText,
  rankGlobalSearchResults,
  searchLocalSources,
  scoreSearchResult,
} from "../src/lib/global-search.ts";

const component = readFileSync("src/components/global-search.tsx", "utf8");
const header = readFileSync("src/components/layout/app-header.tsx", "utf8");
const hook = readFileSync("src/hooks/use-operations.ts", "utf8");
const changedSources = component + header + hook + readFileSync("src/lib/global-search.ts", "utf8");
const item = (id, type = "Cliente", title = id, extra = {}) => ({ id, type, title, route: "/clientes", ...extra });
const fullAccess = { clients: true, processes: true, finance: true };

describe("busca global: teclado e interface", () => {
  test("Ctrl+K e Cmd+K abrem e previnem o atalho do navegador", () => {
    assert.match(header, /event\.metaKey \|\| event\.ctrlKey/);
    assert.match(header, /event\.preventDefault\(\)/);
    assert.match(header, /setSearchOpen/);
  });
  test("Escape fecha e setas/Enter são delegados ao Command acessível", () => {
    assert.match(component, /CommandDialog open=\{open\} onOpenChange=\{onOpenChange\}/);
    assert.match(component, /CommandInput autoFocus aria-label=/);
  });
  test("usa navegação interna e fecha antes de navegar", () => {
    assert.match(component, /onOpenChange\(false\)[\s\S]*navigate\(\{ to: result\.route \}\)/);
    assert.doesNotMatch(component, /window\.open|target=["']_blank/);
  });
  test("mostra estados inicial, vazio e carregando", () => {
    assert.match(component, /Busque clientes, processos, tarefas e muito mais\./);
    assert.match(component, /Nenhum resultado encontrado\./);
    assert.match(component, /Buscando na organização\.\.\./);
  });
});

describe("busca global: regressões observadas em produção", () => {
  test("A) monitoramento mantém Navegação, Ajuda e Novidades simultaneamente", () => {
    const results = composeGlobalSearchResults("monitoramento", fullAccess);
    assert.equal(results[0].type, "Navegação");
    assert.equal(results[0].title, "Monitoramento");
    assert.ok(results.some((result) => result.type === "Ajuda"));
    assert.ok(results.some((result) => result.type === "Novidade"));
  });

  test("B) ronaldo mantém RONALDO TEIXEIRA junto dos resultados locais", () => {
    const client = item("ronaldo", "Cliente", "RONALDO TEIXEIRA");
    assert.ok(composeGlobalSearchResults("ronaldo", fullAccess, [client]).includes(client));
  });

  test("C) teste mantém o cliente correspondente", () => {
    const client = item("teste", "Cliente", "teste");
    assert.ok(composeGlobalSearchResults("teste", fullAccess, [client]).includes(client));
  });

  test("D) chegada remota acrescenta sem substituir os locais", () => {
    const local = composeGlobalSearchResults("monitoramento", fullAccess);
    const client = item("monitoramento", "Cliente", "Monitoramento Cliente");
    const complete = composeGlobalSearchResults("monitoramento", fullAccess, [client]);
    for (const result of local) assert.ok(complete.some((candidate) => candidate.type === result.type && candidate.id === result.id));
    assert.ok(complete.includes(client));
  });

  test("E) resposta de termo anterior só é composta quando corresponde ao termo atual", () => {
    assert.match(component, /normalizedTerm === debouncedTerm \? remote\.data \?\? \[\] : \[\]/);
    assert.match(hook, /queryKey: \["global-search", organizationId, trimmed/);
  });

  test("F) falha de uma fonte preserva resultados das fontes concluídas", () => {
    const process = item("processo", "Processo", "Monitoramento do processo");
    const results = composeGlobalSearchResults("monitoramento", fullAccess, [process]);
    assert.ok(results.includes(process));
    assert.ok(results.some((result) => result.type === "Navegação"));
    assert.match(hook, /Promise\.allSettled/);
  });

  test("G) limite global reserva espaço para todos os grupos relevantes", () => {
    const types = ["Navegação", "Cliente", "Processo", "Tarefa", "Documento", "Comunicação", "Financeiro", "Monitoramento", "Ajuda", "Novidade"];
    const rows = types.flatMap((type) => Array.from({ length: 5 }, (_, index) => item(`${type}-${index}`, type, `alfa ${index}`)));
    const results = rankGlobalSearchResults(rows, "alfa");
    assert.equal(results.length, GLOBAL_SEARCH_LIMIT);
    for (const type of types) assert.ok(results.some((result) => result.type === type), type);
  });

  test("H) Navegação continua disponível sem qualquer resposta remota", () => {
    const results = composeGlobalSearchResults("monitoramento", fullAccess, []);
    assert.ok(results.some((result) => result.type === "Navegação" && result.title === "Monitoramento"));
  });
});

describe("busca global: ranking local", () => {
  test("normaliza acentos e caixa", () => assert.equal(normalizeSearchText("  JOÃO  "), "joao"));
  test("prioriza título exato, prefixo, título, keyword e subtítulo", () => {
    const exact = item("1", "Cliente", "Alfa");
    assert.ok(scoreSearchResult(exact, "alfa") > scoreSearchResult(item("2", "Cliente", "Alfabeto"), "alfa"));
    assert.ok(scoreSearchResult(item("2", "Cliente", "Alfabeto"), "alfa") > scoreSearchResult(item("3", "Cliente", "Grupo Alfa"), "alfa"));
    assert.ok(scoreSearchResult(item("3", "Cliente", "Grupo Alfa"), "alfa") > scoreSearchResult(item("4", "Cliente", "Outro", { keywords: ["alfa"] }), "alfa"));
    assert.ok(scoreSearchResult(item("4", "Cliente", "Outro", { keywords: ["alfa"] }), "alfa") > scoreSearchResult(item("5", "Cliente", "Outro", { subtitle: "alfa" }), "alfa"));
  });
  test("deduplica por tipo e id", () => assert.equal(rankGlobalSearchResults([item("a"), item("a")], "a").length, 1));
  test("respeita limite por módulo", () => assert.equal(rankGlobalSearchResults(Array.from({ length: 9 }, (_, i) => item(String(i), "Cliente", `alfa ${i}`)), "alfa").length, GLOBAL_SEARCH_MODULE_LIMIT));
  test("respeita limite global", () => {
    const types = ["Cliente", "Processo", "Tarefa", "Documento", "Comunicação", "Financeiro", "Monitoramento", "Ajuda", "Novidade"];
    const rows = types.flatMap((type) => Array.from({ length: 5 }, (_, i) => item(`${type}-${i}`, type, `alfa ${i}`)));
    assert.equal(rankGlobalSearchResults(rows, "alfa").length, GLOBAL_SEARCH_LIMIT);
  });
  test("pesquisa Ajuda e Novidades nas bases locais", () => {
    assert.ok(searchLocalSources("criar um cliente").some((result) => result.type === "Ajuda"));
    assert.ok(searchLocalSources("monitoramento operacional").some((result) => result.type === "Novidade"));
  });
});

describe("busca global: fontes remotas e segurança", () => {
  for (const [label, pattern] of [["cliente", /CLIENTS_SOURCE/], ["processo", /from\("processes"\)/], ["tarefa", /from\("tasks"\)/], ["documento", /from\("documents"\)/], ["comunicação", /from\("communication_threads"\)/], ["financeiro", /from\("financial_transactions"\)/], ["monitoramento", /from\("operational_monitoring_alerts"\)/]]) {
    test(`consulta ${label} com estrutura existente`, () => assert.match(hook, pattern));
  }
  test("debounce é de 250ms e termo curto não dispara fonte remota", () => {
    assert.match(component, /setTimeout\([\s\S]*250\)/);
    assert.match(hook, /trimmed\.length >= 2/);
  });
  test("falha isolada não quebra as demais fontes", () => assert.match(hook, /Promise\.allSettled/));
  test("clientes usa organização, somente ativos e nome com ilike", () => {
    assert.match(hook, /from\(CLIENTS_SOURCE\)[\s\S]*?eq\("organization_id", organizationId\)\.is\("archived_at", null\)[\s\S]*?name\.ilike/);
  });
  test("módulo sem permissão não é consultado", () => {
    assert.match(component, /can\("finance\.view"\)/);
    assert.match(hook, /if \(!enabled\) return \[\]/);
  });
  test("cada consulta e o agregado têm limites", () => {
    assert.ok((hook.match(/\.limit\(5\)/g) ?? []).length >= 7);
    assert.equal(GLOBAL_SEARCH_MODULE_LIMIT, 5);
    assert.equal(GLOBAL_SEARCH_LIMIT, 25);
  });
  test("não adiciona migration, RPC, view, Edge Function ou service role", () => {
    assert.doesNotMatch(changedSources, /\.rpc\(|service_role|functions\.invoke|create\s+(?:or\s+replace\s+)?view|create\s+function/i);
  });
});
