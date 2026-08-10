import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";

const route = readFileSync("src/routes/_authenticated/central.tsx", "utf8");
const rules = readFileSync("src/lib/command-center.ts", "utf8");

describe("Central de Comando", () => {
  test("exibe os oito indicadores solicitados", () =>
    [
      "Tarefas atrasadas",
      "Tarefas para hoje",
      "Processos críticos",
      "Alertas críticos",
      "Contas vencidas",
      "Retornos atrasados",
      "Documentos vencendo",
      "Próximos vencimentos",
    ].forEach((label) => assert.match(route, new RegExp(label))));
  test("renderiza valores zero sem ocultar cards", () =>
    assert.match(route, /documents\.data\?\.expiring \?\? 0/));
  test("cards navegam para módulos existentes", () =>
    [
      "/tarefas",
      "/processos",
      "/monitoramento",
      "/financeiro",
      "/comunicacao",
      "/documentos",
    ].forEach((path) => assert.match(route, new RegExp(path))));
  test("possui lista Precisa de atenção", () => assert.match(route, /title="Precisa de atenção"/));
  test("ordena atenção por prioridade e prazo", () => {
    assert.match(rules, /rank\[a\.priority\]/);
    assert.match(rules, /localeCompare/);
  });
  test("reutiliza prioridade do Monitoramento", () =>
    assert.match(rules, /effectivePriority\(alert\)/));
  test("possui bloco Financeiro sem ação de pagamento", () => {
    assert.match(route, /title="Financeiro"/);
    assert.doesNotMatch(route, /useFinancialPayment/);
  });
  test("possui bloco Comunicação", () => assert.match(route, /title="Retornos e comunicação"/));
  test("possui bloco Tarefas limitado", () => assert.match(route, /openTasks\.slice\(0, 5\)/));
  test("possui bloco Processos", () => assert.match(route, /title="Processos"/));
  test("possui empty states objetivos", () =>
    [
      "Não há tarefas atrasadas",
      "Nenhum alerta crítico",
      "Não há contas vencidas",
      "Todos os retornos estão em dia",
    ].forEach((text) => assert.match(route, new RegExp(text))));
  test("erro é isolado por bloco", () => {
    assert.match(route, /role="alert"/);
    assert.match(route, /Não foi possível carregar este bloco/);
  });
  test("loading usa skeleton por bloco", () =>
    assert.match(route, /aria-label={`Carregando \${title}`}/));
  test("permissões evitam consulta e link financeiro/processual", () => {
    assert.match(route, /canFinance \? organizationId : null/);
    assert.match(route, /canProcesses \? organizationId : null/);
  });
  test("layout responsivo progride de uma para duas colunas", () => {
    assert.match(route, /grid-cols-1/);
    assert.match(route, /lg:grid-cols-2/);
  });
  test("não adiciona artefatos de backend", () => {
    const changedBackend = readdirSync("supabase/migrations").filter(
      (name) => name.includes("command") || name.includes("central_comando"),
    );
    assert.deepEqual(changedBackend, []);
    assert.doesNotMatch(route + rules, /service_role|supabase\.functions|\.rpc\(/);
  });
});
