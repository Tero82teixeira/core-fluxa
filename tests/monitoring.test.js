import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import { classifyDeadline, filterMonitoringAlerts, suggestPriority, uniqueAlerts } from "../src/lib/monitoring.ts";
const migration=readFileSync("supabase/migrations/20260809190000_operational_monitoring_center.sql","utf8");
const base={organization_id:"org",source_type:"tarefa",source_id:"1",alert_kind:"tarefa_atrasada",title:"Entregar",description:"Cliente Alfa",client_id:"c",client_name:"Alfa",process_id:null,process_code:null,responsible_id:"u",responsible_name:"Ana",source_priority:"media",suggested_priority:"alta",relevant_at:"2026-08-08",last_movement_at:null,days_delta:-1,reason:"atrasada",source_status:"pendente",monitoring_status:"novo",assigned_to:null,assigned_name:null,priority_override:null,notes:null,state_updated_at:null};
describe("regras da central de monitoramento",()=>{
 test("tarefa atrasada",()=>assert.equal(classifyDeadline("2026-08-08",new Date("2026-08-09T12:00:00Z")).overdue,true));
 test("tarefa vencendo hoje",()=>assert.equal(classifyDeadline("2026-08-09",new Date("2026-08-09T12:00:00Z")).today,true));
 test("tarefa em sete dias",()=>assert.equal(classifyDeadline("2026-08-16",new Date("2026-08-09T12:00:00Z")).next7,true));
 test("prioridade considera atraso, origem e valor",()=>{assert.equal(suggestPriority(-8),"critica");assert.equal(suggestPriority(2),"media");assert.equal(suggestPriority(20,"alta"),"alta");assert.equal(suggestPriority(20,null,50000),"critica")});
 test("remove alertas duplicados pela chave lógica",()=>assert.equal(uniqueAlerts([base,base]).length,1));
 test("filtra busca, prazo, tipo, status e prioridade",()=>{assert.equal(filterMonitoringAlerts([base],{search:"Ana",window:"vencidos",type:"tarefa",status:"novo",priority:"alta"}).length,1);assert.equal(filterMonitoringAlerts([base],{search:"Beta"}).length,0)});
 test("retornos e financeiro usam campos reais",()=>{assert.match(migration,/c\.follow_up_at<now\(\)/);assert.match(migration,/f\.due_date<current_date/);assert.match(migration,/financial_transaction_payments/)});
 test("hoje e próximos sete dias estão nas fontes",()=>{assert.match(migration,/t\.due_at::date=current_date/);assert.match(migration,/current_date\+7/)});
});
describe("segurança e acompanhamento",()=>{
 test("status separado e reabertura são auditados",()=>{assert.match(migration,/monitoring_status/);assert.match(migration,/monitoring\.reopened/)});
 test("visualizador não recebe escrita",()=>{assert.doesNotMatch(migration,/monitoring_assert_source[\s\S]*visualizador/);assert.match(migration,/REVOKE INSERT, UPDATE, DELETE ON public\.monitoring_states FROM authenticated/)});
 test("operacional não atribui responsável nem altera prioridade",()=>{assert.match(migration,/upsert_monitoring_state[\s\S]*monitoring_assert_admin/);assert.match(migration,/assign_monitoring_item[\s\S]*monitoring_assert_admin/)});
 test("gestor, administrador e proprietário possuem validação administrativa",()=>assert.match(migration,/monitoring_assert_admin[\s\S]*'proprietario','administrador','gestor'/));
 test("operacional atualiza apenas análise e acompanhamento",()=>assert.match(migration,/status NOT IN \('em_analise','acompanhado'\) THEN PERFORM public\.monitoring_assert_admin/));
 test("protege organização da origem e do responsável",()=>{assert.match(migration,/MONITORING_SOURCE_ORG_MISMATCH/);assert.match(migration,/MONITORING_ASSIGNEE_ORG_MISMATCH/)});
 test("RLS e RPCs não são públicas ou anônimas",()=>{assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,anon/);assert.match(migration,/GRANT EXECUTE[\s\S]+TO authenticated/)});
 test("não permite duplicação nem delete físico",()=>{assert.match(migration,/UNIQUE \(organization_id, source_type, source_id, alert_kind\)/);assert.doesNotMatch(migration,/DELETE FROM public\.monitoring_states/)});
 test("view executa como invocador e preserva RLS financeiro",()=>{assert.match(migration,/operational_monitoring_alerts WITH \(security_invoker=true\)/);assert.match(migration,/FROM public\.financial_transactions f/);assert.doesNotMatch(migration,/operational_monitoring_alerts[\s\S]*SECURITY DEFINER/)});
});
