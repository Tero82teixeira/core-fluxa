import test from 'node:test';
import assert from 'node:assert/strict';
import {CONSULTING_FOCUSES,consultingDiagnosticCanRead,emptyConsultingDiagnostic,consultingDiagnosticValid,consultingDiagnosticPayload} from '../src/lib/consulting-diagnostic.ts';
import {buildConsultingDemo,buildConsultingDemoData,saveConsultingDemoDiagnostic} from '../src/lib/consulting-demo.ts';
const valid={focus:'processes',situation:'Pedidos dispersos',attempts:'Planilha',expected_result:'Organizar pedidos',priority:'high',target_on:'2026-11-20'};
test('diagnóstico valida campos, limites e datas civis antes de gravar',()=>{
 assert(!consultingDiagnosticValid(emptyConsultingDiagnostic()));
 for(const focus of CONSULTING_FOCUSES) assert(consultingDiagnosticValid({...valid,focus}));
 for(const priority of ['low','medium','high']) assert(consultingDiagnosticValid({...valid,priority}));
 assert(consultingDiagnosticValid({...valid,target_on:'',attempts:''}));
 assert(consultingDiagnosticValid({...valid,target_on:'2028-02-29'}));
 for(const change of [{situation:'  '},{expected_result:'xx'},{attempts:'x'.repeat(2001)},{situation:'x'.repeat(2001)},{expected_result:'x'.repeat(2001)},{focus:'bad'},{priority:'urgent'},{target_on:'2026-02-29'},{target_on:'1999-12-31'},{target_on:'2101-01-01'},{target_on:'2026-1-01'}]) assert.throws(()=>consultingDiagnosticPayload({...valid,...change}),/INVALID/);
 const original={...valid,situation:'  Contexto  ',unrelated:'IGNORAR'};
 assert.deepEqual(consultingDiagnosticPayload(original),{...valid,situation:'Contexto'});assert.equal(original.situation,'  Contexto  ');
 assert.notEqual(emptyConsultingDiagnostic(),emptyConsultingDiagnostic());
});
test('diagnóstico de demonstração permanece ligado ao cliente e não altera outros módulos',()=>{
 const data=buildConsultingDemoData(),state=buildConsultingDemo();const snapshot=structuredClone({data,state});
 assert(state.diagnostics.r1.example);assert.equal(state.diagnostics.r2,undefined);
 const saved=saveConsultingDemoDiagnostic(data,state,'r2',valid);
 assert.deepEqual(saved.diagnostics.r2,valid);assert(!saved.diagnostics.r2.example);
 assert.deepEqual({data,state},snapshot);
 for(const key of ['requests','proposals','projectProfiles','deliveries','monthlyPlans','monthlyGenerated']) assert.strictEqual(saved[key],state[key]);
 assert.throws(()=>saveConsultingDemoDiagnostic(data,state,'inexistente',valid),/CLIENT_NOT_FOUND/);
 assert.throws(()=>saveConsultingDemoDiagnostic(data,state,'r1',{...valid,situation:''}),/INVALID/);
 const reset=buildConsultingDemo();assert.equal(reset.diagnostics.r2,undefined);assert(reset.diagnostics.r1.example);
 const edited=saveConsultingDemoDiagnostic(data,saved,'r1',valid);assert.equal(edited.diagnostics.r1.example,undefined);assert.deepEqual(edited.diagnostics.r2,valid);
});
test('diagnóstico visível apenas para os papéis internos autorizados',()=>{
 for(const role of ['superadmin','proprietario','administrador','gestor','operacional','visualizador'])assert(consultingDiagnosticCanRead(role));
 for(const role of ['atendimento','financeiro','cliente_externo','unknown',null])assert(!consultingDiagnosticCanRead(role));
});
