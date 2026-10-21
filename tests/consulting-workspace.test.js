import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { NAV_ITEMS, consultingNavigation, navItemVisibleForRole } from '../src/lib/navigation.ts';
import { routeVisibleForModules } from '../src/lib/organization-segments.ts';
import { PROCESS_STAGE } from '../src/lib/domain.ts';
import { processStageDefinitions, consultingItemActive } from '../src/lib/consulting-workspace.ts';
import { directOnboardingSubtype, initialOnboardingStep, previousOnboardingStep } from '../src/lib/onboarding-entry.ts';
const visible = (role='proprietario',modules=[])=>NAV_ITEMS.filter(i=>navItemVisibleForRole(i.to,role)&&routeVisibleForModules(i.to,'consulting_services',modules));
test('consultoria organiza a rotina sem ampliar permissões ou perder destinos',()=>{
 const nav=consultingNavigation(visible());
 assert.deepEqual(nav.operation.map(i=>i.label),['Visão do dia','Clientes','Atendimentos','Propostas','Projetos e entregas','Agenda','Tarefas','Documentos']);
 for(const role of ['proprietario','gestor','operacional','atendimento','financeiro','visualizador','cliente_externo']){
  const allowed=visible(role), items=Object.values(consultingNavigation(allowed)).flat();
  assert.deepEqual(new Set(items.map(i=>i.to)),new Set(allowed.map(i=>i.to)));
  assert.equal(items.some(i=>i.search?.tipo==='commercial'),allowed.some(i=>i.to==='/relatorios'));
 }
 const limited=Object.values(consultingNavigation(visible('proprietario',['clients']))).flat();
 assert(!limited.some(i=>i.to==='/processos'));
 assert(limited.some(i=>i.to==='/clientes'));
});
test('atalhos de relatórios têm apenas um item ativo e respeitam a troca de aba',()=>{
 const items=Object.values(consultingNavigation(visible())).flat().filter(i=>i.to==='/relatorios');
 for(const tipo of ['commercial','agenda','overview',undefined]){
  const selected=items.filter(i=>consultingItemActive(i,'/relatorios',{tipo}));
  assert.equal(selected.length,1);assert.equal(selected[0].search?.tipo,['commercial','agenda'].includes(tipo)?tipo:undefined);
 }
 assert(consultingItemActive({to:'/processos'},'/processos/id',{}));
 assert(!consultingItemActive({to:'/processos'},'/processos-novo',{}));
});
test('etapas de consultoria preservam valores e semântica para os outros setores',()=>{
 const stages=processStageDefinitions('consulting_services');
 assert.deepEqual(Object.keys(stages),Object.keys(PROCESS_STAGE));
 for(const key of Object.keys(stages))assert.equal(stages[key].tone,PROCESS_STAGE[key].tone);
 assert.equal(stages.montagem.label,'Em execução');assert.equal(stages.finalizado.label,'Projeto concluído');
 for(const segment of ['legal','health','real_estate',null])assert.equal(processStageDefinitions(segment),PROCESS_STAGE);
});
test('consultoria começa com perfil geral e preserva retomada e especializações salvas',()=>{
 assert.equal(directOnboardingSubtype('consulting_services'),'consulting');
 assert.equal(initialOnboardingStep('consulting_services',null,0),0);
 assert.equal(initialOnboardingStep('consulting_services','consulting',0),2);
 assert.equal(initialOnboardingStep('consulting_services','advisory',2),4);
 assert.equal(previousOnboardingStep(2,'consulting_services'),0);
 const form=readFileSync('src/routes/_authenticated/processos.novo.tsx','utf8');
 assert.match(form,/clientId/);
 const proposals=readFileSync('src/components/reports/commercial-proposals-panel.tsx','utf8');
 assert.match(proposals,/proposal.status === "accepted"/);assert.match(proposals,/proposalId:proposal.id|proposalId: proposal.id/);assert.match(proposals,/proposal.converted_client_id/);
 assert.match(proposals,/can\("processes.create"\)/);
});
