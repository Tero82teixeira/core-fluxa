import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {consultingProjectPayload,consultingDeliveryPayload,consultingDeliveryProgress,validConsultingDate} from '../src/lib/consulting-project.ts';
import {buildConsultingDemo,buildConsultingDemoData,saveConsultingDemoProfile,saveConsultingDemoDelivery,toggleConsultingDelivery,advanceConsultingDemoProject} from '../src/lib/consulting-demo.ts';
const profile={title:'  Reduzir retrabalho  ',description:'  Diagnóstico e plano de ação  ',owner_name:'  Equipe  ',due_date:'2026-11-20'};
const delivery={title:'  Apresentar plano  ',description:'  Reunião de apresentação  ',assignee_name:'  Ana  ',due_date:'2026-10-17',status:'recebido',required:true};
test('ficha mantém apenas campos persistidos e valida limites e datas civis',()=>{
 assert.deepEqual(consultingProjectPayload(profile),{title:'Reduzir retrabalho',description:'Diagnóstico e plano de ação',owner_name:'Equipe',due_date:'2026-11-20'});
 assert.deepEqual(consultingProjectPayload({...profile,description:' ',owner_name:'',due_date:''}),{title:'Reduzir retrabalho',description:null,owner_name:null,due_date:null});
 for(const date of ['2026-02-29','2026-11-31','2026-1-01','ontem','1899-12-31'])assert(!validConsultingDate(date));
 assert(validConsultingDate('2028-02-29'));
 for(const change of [{title:'  '},{title:'a'.repeat(161)},{description:'a'.repeat(4001)},{owner_name:'a'.repeat(121)},{due_date:'2026-02-30'}])assert.throws(()=>consultingProjectPayload({...profile,...change}));
 assert.throws(()=>consultingDeliveryPayload({...delivery,status:'pago'}));
 assert.equal(consultingDeliveryPayload(delivery).assignee_name,'Ana');
});
test('progresso distingue entrega recebida, validação, atraso e conclusão',()=>{
 const items=[{status:'recebido',due_date:'2026-10-17'},{status:'em_analise',due_date:'2026-10-18'},{status:'aprovado',due_date:'2026-10-16'},{status:'pendente',due_date:null}];
 assert.deepEqual(consultingDeliveryProgress(items,'2026-10-18'),{total:4,done:1,pending:3,overdue:1,percent:25});
 assert.deepEqual(consultingDeliveryProgress([],'2026-10-18'),{total:0,done:0,pending:0,overdue:0,percent:0});
});
test('demo edita ficha e entrega sem perder vínculo, fecha apenas após conclusão e reinicia',()=>{
 let data=buildConsultingDemoData(),state=buildConsultingDemo();
 ({data,state}=saveConsultingDemoProfile(data,state,'c1',profile));
 assert.equal(state.projectProfiles.c1.title,'Reduzir retrabalho');assert.equal(data.cases[0].due,'2026-11-20');assert.equal(data.cases[0].recordId,'r1');
 state=saveConsultingDemoDelivery(state,'c1',delivery);
 const created=state.deliveries.at(-1);assert.equal(created.projectId,'c1');assert.equal(created.done,false);
 state=saveConsultingDemoDelivery(state,'c1',{...delivery,status:'aprovado'},created.id);
 assert.equal(state.deliveries.at(-1).done,true);assert.equal(state.deliveries.at(-1).status,'aprovado');
 state=toggleConsultingDelivery(state,created.id);assert.equal(state.deliveries.at(-1).status,'pendente');
 assert.throws(()=>saveConsultingDemoDelivery(state,'c2',delivery,created.id));
 const stage2={...data,cases:data.cases.map(c=>c.id==='c1'?{...c,stage:2}:c)};
 assert.equal(advanceConsultingDemoProject(stage2,state,'c1'),stage2);
 assert.deepEqual(buildConsultingDemo().projectProfiles,{});
 assert.equal(buildConsultingDemoData().cases[0].due,'2026-10-12');
});
test('gravações confirmam linha alterada e restringem item ao projeto e empresa atuais',()=>{
 const source=readFileSync('src/hooks/use-mutations.ts','utf8');
 const update=source.split('export function useUpdateChecklistItem')[1].split('Tipos de serviço')[0];
 assert.match(update,/eq\("organization_id", organizationId\)/);assert.match(update,/eq\("process_id", processId\)/);assert.match(update,/is\("deleted_at",\s*null\)/);assert.match(update,/select\("id"\)\.single\(\)/);
 const project=source.split('export function useUpdateProcess')[1].split('Tarefas')[0];assert.match(project,/select\("id"\)\.single\(\)/);assert.match(project,/client-processes/);
 for(const path of ['src/components/consulting/consulting-project-card.tsx','src/components/consulting/consulting-deliveries-card.tsx'])assert.doesNotMatch(readFileSync(path,'utf8'),/supabase|useAuth|fetch\(|localStorage/);
});
