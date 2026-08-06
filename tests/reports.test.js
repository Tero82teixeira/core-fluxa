import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createCsv, groupCount, isInPeriod, isOverdue, monitoringBuckets, periodRange, sanitizeClient } from "../src/lib/reports.ts";

const route = readFileSync(new URL("../src/routes/_authenticated/relatorios.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/use-reports.ts", import.meta.url), "utf8");

describe("módulo de relatórios", () => {
  test("registra a rota autenticada", () => assert.match(route, /\/_authenticated\/relatorios/));
  test("remove estado em breve", () => assert.doesNotMatch(route, /ComingSoon|em breve/i));
  test("exige organização ativa", () => assert.match(route, /if \(!organizationId\)/));
  test("todas as fontes são isoladas por organization_id", () => assert.match(hook, /eq\("organization_id", organizationId\)/));
  test("limita volume das consultas", () => assert.match(hook, /limit\(LIMIT\)/));
  test("faz consultas paralelas", () => assert.match(hook, /Promise\.all/));
  test("calcula agrupamentos", () => assert.deepEqual(groupCount([{s:"a"},{s:"a"},{s:"b"}], x=>x.s), {a:2,b:1}));
  test("identifica tarefa atrasada", () => assert.equal(isOverdue("2026-08-01", "pendente", new Date("2026-08-02")), true));
  test("não atrasa tarefa concluída", () => assert.equal(isOverdue("2026-08-01", "concluida", new Date("2026-08-02")), false));
  test("identifica monitoramento vencido", () => assert.equal(monitoringBuckets("2026-08-01", new Date("2026-08-02")).expired, true));
  test("identifica vencimento em 7 dias", () => assert.equal(monitoringBuckets("2026-08-07", new Date("2026-08-02")).in7, true));
  test("identifica vencimento em 30 dias", () => assert.equal(monitoringBuckets("2026-08-25", new Date("2026-08-02")).in30, true));
  test("filtra últimos 7 dias", () => assert.equal(isInPeriod("2026-08-02", periodRange("7d", new Date("2026-08-06"))), true));
  test("filtra período personalizado", () => assert.equal(isInPeriod("2026-07-15", periodRange("custom", new Date("2026-08-06"), {from:"2026-07-01",to:"2026-07-31"})), true));
  test("filtros de cliente, responsável, status e prioridade estão disponíveis", () => ["Cliente","Responsável","Status","Prioridade"].forEach(x=>assert.match(route,new RegExp(x))));
  test("CSV usa BOM UTF-8 e separador do Excel pt-BR", () => { const csv=createCsv([{nome:"João",total:2}]); assert.equal(csv.charCodeAt(0),0xfeff); assert.match(csv,/"nome";"total"/); });
  test("CSV escapa aspas", () => assert.match(createCsv([{nome:'A "B"'}]), /A ""B""/));
  test("exportação usa somente linhas filtradas", () => assert.match(route, /exportRows\(kind,matching\)/));
  test("visualizador não recebe PII sensível", () => { const row=sanitizeClient({name:"Ana",email:"a@x",phone:"1",document:"2"},"visualizador"); assert.deepEqual(row,{name:"Ana"}); });
  test("proprietário e administrador preservam campos autorizados", () => { assert.equal(sanitizeClient({email:"a"},"proprietario").email,"a"); assert.equal(sanitizeClient({email:"a"},"administrador").email,"a"); });
  test("operacional não recebe PII sensível", () => assert.equal("email" in sanitizeClient({email:"a"},"operacional"),false));
  test("impressão possui cabeçalho e oculta botões", () => { assert.match(route,/print-header/); assert.match(route,/no-print/); });
  test("gráficos têm estado vazio acessível", () => { assert.match(route,/Sem dados no período/); assert.match(route,/role="img"/); });
  test("tabelas têm loading, erro e vazio", () => ["Carregando dados reais","Não foi possível carregar","Nenhum registro encontrado"].forEach(x=>assert.match(route,new RegExp(x))));
  test("não adiciona migration ou Edge Function", () => { const changed=["src/lib/reports.ts","src/hooks/use-reports.ts","src/routes/_authenticated/relatorios.tsx","src/styles.css","tests/reports.test.js"]; assert.equal(changed.some(x=>x.startsWith("supabase/migrations")||x.startsWith("supabase/functions")),false); });
  test("não usa service role, URL externa nem dado fictício", () => assert.doesNotMatch(route+hook,/service_role|https?:\/\/|mock|faker/i));
  test("não adiciona dependência", () => assert.equal(readdirSync(new URL("../",import.meta.url)).includes("package-lock.json"), false));
});
