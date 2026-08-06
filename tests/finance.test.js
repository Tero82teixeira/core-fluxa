import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { brDate, brl, financialBuckets, financialCsv } from "../src/lib/finance.ts";

const route=readFileSync(new URL("../src/routes/_authenticated/financeiro.tsx",import.meta.url),"utf8");
const hook=readFileSync(new URL("../src/hooks/use-finance.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20260806120000_financial_module.sql",import.meta.url),"utf8");
describe("módulo financeiro",()=>{
 test("ativa rota autenticada sem estado em breve",()=>{assert.match(route,/\/_authenticated\/financeiro/);assert.doesNotMatch(route,/ComingSoon|em breve/i)});
 test("formata Real e data pt-BR",()=>{assert.equal(brl(1234.56),"R$ 1.234,56");assert.equal(brDate("2026-08-06"),"06/08/2026")});
 test("classifica vencidos e próximos vencimentos",()=>{assert.equal(financialBuckets("2026-08-01","pending",new Date("2026-08-06")).overdue,true);assert.equal(financialBuckets("2026-08-12","pending",new Date("2026-08-06")).in7,true);assert.equal(financialBuckets("2026-08-30","pending",new Date("2026-08-06")).in30,true)});
 test("não considera pagos vencidos",()=>assert.equal(financialBuckets("2026-08-01","paid",new Date("2026-08-06")).overdue,false));
 test("CSV tem BOM, ponto e vírgula e escapa aspas",()=>{const csv=financialCsv([{nome:'A "B"',valor:brl(1)}]);assert.equal(csv.charCodeAt(0),0xfeff);assert.match(csv,/;|A ""B""/)});
 test("consulta fontes reais isoladas por organização",()=>{assert.match(hook,/eq\("organization_id",organizationId\)/);assert.doesNotMatch(route+hook,/mock|faker|service_role/i)});
 test("dashboard, gráficos, filtros, paginação e estados acessíveis",()=>["Saldo atual","Resultado do mês","Receitas x despesas","Despesas por categoria","Contas a receber por status","Carregando dados financeiros reais","Nenhum lançamento encontrado","Página","Buscar lançamento"].forEach(x=>assert.match(route,new RegExp(x))));
 test("tabelas têm RLS e não há policy irrestrita",()=>{assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g)||[]).length,6);assert.doesNotMatch(migration,/USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i)});
 test("valores zero e negativos são rejeitados",()=>assert.ok((migration.match(/CHECK\(amount>0\)/g)||[]).length>=3));
 test("organização é imutável e vínculos cruzados são rejeitados",()=>["ORGANIZATION_IMMUTABLE","INVALID_CLIENT_ORGANIZATION","INVALID_PROCESS_ORGANIZATION","INVALID_TASK_ORGANIZATION","INVALID_DOCUMENT_ORGANIZATION","INVALID_RESPONSIBLE_ORGANIZATION"].forEach(x=>assert.match(migration,new RegExp(x))));
 test("pagamento usa locks, limita saldo, atualiza status e conta",()=>["FOR UPDATE","PAYMENT_EXCEEDS_BALANCE","'partial'","'paid'","current_balance=newbal","paid_at"].forEach(x=>assert.match(migration,new RegExp(x))));
 test("pagamento cancelado ou arquivado é impedido e estorno existe",()=>["TRANSACTION_NOT_PAYABLE","reverse_financial_payment","reversed_at","'reversal'"].forEach(x=>assert.match(migration,new RegExp(x))));
 test("recorrência deduplica e avança próxima execução",()=>["UNIQUE\\(recurrence_id,recurrence_due_date\\)","ON CONFLICT\\(recurrence_id,recurrence_due_date\\) DO NOTHING","next_run_date=run_date"].forEach(x=>assert.match(migration,new RegExp(x))));
 test("RPCs exigem autenticação, papel e auditam",()=>["auth\\.uid\\(\\) IS NULL","has_org_role","financial_audit"].forEach(x=>assert.match(migration,new RegExp(x))));
 test("PUBLIC e anon revogados e DELETE físico indisponível",()=>{assert.match(migration,/REVOKE EXECUTE[\s\S]*PUBLIC, anon/);assert.match(migration,/REVOKE DELETE[\s\S]*authenticated,PUBLIC,anon/)});
 test("não adiciona Edge Function, serviço externo ou segredo",()=>assert.doesNotMatch(migration+route+hook,/https?:\/\/|SUPABASE_SERVICE_ROLE|service.role|edge function/i));
});
