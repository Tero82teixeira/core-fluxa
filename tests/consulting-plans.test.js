import assert from 'node:assert/strict';import test from 'node:test';
import {validMonthlyPlan,parseMonthlyAmount,monthInPlan,monthlyDueDate} from '../src/lib/consulting-plans.ts';
import {buildConsultingDemo,buildConsultingDemoData,saveConsultingDemoPlan,generateConsultingDemoMonth} from '../src/lib/consulting-demo.ts';
const plan={service_name:'Assessoria mensal',monthly_amount:1500,starts_on:'2026-10-15',ends_on:'2027-03-12',status:'ativo',return_on:null,routine:[{title:'Reunião de acompanhamento',day:5},{title:'Relatório mensal',day:31}]};
test('plano mensal valida valor, período e modelo e ajusta datas civis',()=>{
 assert(validMonthlyPlan(plan));assert.equal(parseMonthlyAmount('1500,50'),1500.5);assert.equal(parseMonthlyAmount('1500.50'),1500.5);
 for(const amount of ['1.500,00','1e3','-2','10,999',''])assert(Number.isNaN(parseMonthlyAmount(amount)));
 for(const patch of [{ends_on:'2026-10-01'},{starts_on:'2026-02-30'},{monthly_amount:-1},{monthly_amount:Infinity},{monthly_amount:1.005},{routine:[]},{routine:Array(21).fill(plan.routine[0])},{routine:[{title:'abc',day:32}]}])assert(!validMonthlyPlan({...plan,...patch}));
 assert(monthInPlan('2026-10',plan));assert(!monthInPlan('2026-09',plan));assert(!monthInPlan('2026-1',plan));
 assert.equal(monthlyDueDate('2026-10',5,plan),'2026-10-15');assert.equal(monthlyDueDate('2027-02',31,plan),'2027-02-28');assert.equal(monthlyDueDate('2027-03',31,plan),'2027-03-12');
 assert.equal(monthlyDueDate('2028-02',31,{...plan,starts_on:'2028-01-01',ends_on:'2028-12-31'}),'2028-02-29');
});
test('demo gera uma rotina por competência, preserva tarefas anteriores e reinicia os exemplos',()=>{
 let data=buildConsultingDemoData(),state=buildConsultingDemo();const initial=data.tasks.length;
 state=saveConsultingDemoPlan(state,'c1',plan,1);let next=generateConsultingDemoMonth(data,state,'c1','2026-10');({data,state}=next);assert.equal(next.created,2);assert.equal(data.tasks.length,initial+2);
 next=generateConsultingDemoMonth(data,state,'c1','2026-10');assert.equal(next.created,0);assert.equal(next.data,data);assert.equal(next.existing,2);
 state=saveConsultingDemoPlan(state,'c1',{...plan,routine:[{title:'Nova atividade',day:10}]},2);next=generateConsultingDemoMonth(data,state,'c1','2026-10');assert.equal(next.created,0);assert.equal(next.data.tasks.at(-1).title,'Relatório mensal');
 next=generateConsultingDemoMonth(data,state,'c1','2026-11');assert.equal(next.created,1);assert.equal(next.data.tasks.at(-1).title,'Nova atividade');assert.equal(next.data.tasks.at(-1).due,'2026-11-10');
 assert.throws(()=>saveConsultingDemoPlan(state,'c1',plan,1),/STALE/);assert.throws(()=>generateConsultingDemoMonth(data,state,'c1','2027-04'),/OUTSIDE_PERIOD/);
 const paused=saveConsultingDemoPlan(state,'c1',{...plan,status:'pausado'},3);assert.throws(()=>generateConsultingDemoMonth(data,paused,'c1','2026-12'),/NOT_ACTIVE/);
 assert.deepEqual(buildConsultingDemo().monthlyGenerated,{});assert.equal(buildConsultingDemoData().tasks.length,initial);
});
