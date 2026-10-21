import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consultingSourceReady,consultingSourceClient,consultingSourceIdValid,consultingProjectFromProposal} from '../src/lib/consulting-project-source.ts';
import {buildConsultingDemo,buildConsultingDemoData,consultingDemoProposalSource,createConsultingDemoProjectFromProposal} from '../src/lib/consulting-demo.ts';
const source={id:'00000000-0000-0000-0000-000000000003',organization_id:'org',client_id:'client',converted_client_id:null,proposal_number:'PROP-001',title:'Título aprovado',service_description:'Escopo aprovado completo',terms:'Condições comerciais',status:'accepted',archived_at:null};
test('origem aceita preenche somente cliente, título, escopo e referência',()=>{
 const data={...source,amount:1500,first_due_date:'2026-11-20',notes:'PRIVADO'};
 assert.deepEqual(consultingProjectFromProposal(data,'org'),{client_id:'client',title:'Título aprovado',description:'Escopo aprovado completo',source_commercial_proposal_id:source.id});
 assert(!JSON.stringify(consultingProjectFromProposal(data,'org')).includes('PRIVADO'));
 assert.equal(consultingProjectFromProposal({...source,title:'x'.repeat(180)},'org').title.length,160);
 assert.equal(data.title,'Título aprovado');
 assert.equal(consultingSourceClient({...source,client_id:null,converted_client_id:'converted'}),'converted');
 assert(consultingSourceReady({...source,client_id:null,converted_client_id:'converted'},'org'));
 for(const change of [{status:'draft'},{status:'sent'},{status:'declined'},{archived_at:'2026-10-20'},{client_id:null,converted_client_id:null},{organization_id:'other'}])assert.throws(()=>consultingProjectFromProposal({...source,...change},'org'),/SOURCE_INVALID/);
 assert(consultingSourceIdValid(source.id));for(const id of ['bad','../../path','<script>'])assert(!consultingSourceIdValid(id));
});
test('demo só cria após revisão e mantém referência consultável sem copiar datas financeiras',()=>{
 const data=buildConsultingDemoData(),state=buildConsultingDemo(),before=structuredClone({data,state});
 const lookup=key=>key==='consultingDemo.services.s3'?'Proposta aceita':'Escopo ilustrativo';
 const proposal=consultingDemoProposalSource(data,state,'p3',lookup);assert(proposal);assert.equal(proposal.title,'Proposta aceita');
 assert.equal(consultingDemoProposalSource(data,state,'p2',lookup),null);
 const preset=consultingProjectFromProposal(proposal,'demo');
 const values={title:preset.title,description:preset.description,owner_name:'Equipe revisada',due_date:'2026-12-20'};
 const next=createConsultingDemoProjectFromProposal(data,state,'p3',values,['Entrega revisada']);
 assert.deepEqual({data,state},before);assert.equal(next.state.projectSources[next.projectId],'p3');
 assert.equal(next.state.proposals.find(p=>p.id==='p3').projectId,next.projectId);
 assert.equal(next.state.projectProfiles[next.projectId].due_date,'2026-12-20');assert.equal(next.state.projectProfiles[next.projectId].owner_name,'Equipe revisada');
 assert.equal(next.state.deliveries.find(d=>d.projectId===next.projectId).title,'Entrega revisada');assert.equal(next.data.cases.find(p=>p.id===next.projectId).amount,0);
 assert.deepEqual(next.data.finance,data.finance);assert.deepEqual(next.data.tasks,data.tasks);assert.strictEqual(next.state.monthlyPlans,state.monthlyPlans);
 assert.equal(consultingDemoProposalSource(next.data,next.state,next.state.projectSources[next.projectId],lookup).id,'p3');
 assert.strictEqual(createConsultingDemoProjectFromProposal(next.data,next.state,'p3',values,[]).state,next.state);
 assert.throws(()=>createConsultingDemoProjectFromProposal(data,state,'p2',values,[]),/SOURCE_INVALID/);
 assert.equal(Object.keys(buildConsultingDemo().projectSources).length,0);
});
test('ativação corresponde à migration e a URL transmite somente o ID da proposta',()=>{
 assert.equal(readFileSync('supabase/migrations/20261021200209_consulting_project_proposal_source.sql','utf8'),readFileSync('docs/operations/consulting-project-proposal-source.sql','utf8'));
 const panel=readFileSync('src/components/reports/commercial-proposals-panel.tsx','utf8');assert.match(panel,/search=\{\{proposalId:proposal.id\}\}/);assert.doesNotMatch(panel,/search=\{\{[^}]*serviceDescription/);
});
