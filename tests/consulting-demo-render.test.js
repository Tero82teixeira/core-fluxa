import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "i18next";

// Renderiza o componente real em processo sem demo, página pública ou provider prévio.
const root = resolve("src");
const hooks = registerHooks({
  resolve(specifier, context, next) {
    let base;
    if (specifier.startsWith("@/")) base = resolve(root, specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(root).href))
      base = fileURLToPath(new URL(specifier, context.parentURL));
    if (base) {
      const file = [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")].find(
        (p) => existsSync(p) && /\.tsx?$/.test(p),
      );
      if (file) return next(pathToFileURL(file).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(pathToFileURL(root).href) && /\.tsx?$/.test(url)) {
      const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return next(url, context);
  },
});
test("consultoria renderiza todas as etapas em PT, EN e ES sem cadastro", async () => {
 const { ConsultingPublicDemo } = await import("../src/components/consulting/consulting-public-demo.tsx");
 const { buildConsultingDemo, buildConsultingDemoData } = await import("../src/lib/consulting-demo.ts");
 for(const language of ["pt","en","es"]){
  await i18n.changeLanguage(language);
  for(const module of ["overview","attendance","proposals","cases","plans","schedule"]){
   const html=renderToStaticMarkup(React.createElement(ConsultingPublicDemo,{module,data:buildConsultingDemoData(),consulting:buildConsultingDemo(),setData:()=>{},setConsulting:()=>{},goTo:()=>{}}));
   assert(html.includes("2026"));assert(!/consultingDemo\.|demo\.data\.|demo\.modules\./.test(html));
   assert(html.includes('min-h-11'));
   if(module==="cases")assert.equal((html.match(/type="checkbox"/g)||[]).length,12);
  }
 }
});

test("ficha e entregas reais renderizam com permissões, texto completo e três idiomas", async()=>{
 const {ConsultingProjectCard}=await import("../src/components/consulting/consulting-project-card.tsx");
 const {ConsultingDeliveriesCard}=await import("../src/components/consulting/consulting-deliveries-card.tsx");
 for(const language of ["pt","en","es"]){
  await i18n.changeLanguage(language);
  const values={title:"Objetivo com texto longo",description:"Escopo linha 1\nEscopo linha 2",owner_name:"Ana",due_date:"2026-10-20"};
  const props={values,canEdit:false,onSave:async()=>{},formatDate:d=>d};
  const readonly=renderToStaticMarkup(React.createElement(ConsultingProjectCard,props));
  assert(readonly.includes("Escopo linha 2"));assert(readonly.includes("whitespace-pre-wrap"));assert(!readonly.includes("<button"));
  const editor=renderToStaticMarkup(React.createElement(ConsultingProjectCard,{...props,canEdit:true}));assert(editor.includes("<button"));
  const html=renderToStaticMarkup(React.createElement(ConsultingDeliveriesCard,{items:[{id:"d1",title:"Plano de ação",description:"Critérios",assignee_name:"Ana",due_date:"2026-10-17",status:"recebido",required:true}],today:"2026-10-18",canEdit:false,onSave:async()=>{},formatDate:d=>d}));
  assert(html.includes('aria-valuenow="0"'));assert(html.includes("2026-10-17"));assert(!html.includes("<button"));
  assert(!/consultingProject\./.test(readonly+editor+html));
 }
});

test("planos mensais renderizam valores, rotina e permissões em três idiomas",async()=>{
 const {ConsultingMonthlyPlanCard}=await import("../src/components/consulting/consulting-monthly-plan-card.tsx");
 const {ConsultingPlansList}=await import("../src/components/consulting/consulting-plans-list.tsx");
 for(const language of ["pt","en","es"]){await i18n.changeLanguage(language);
  const plan={process_id:"c1",organization_id:"demo",revision:1,service_name:"Assessoria",monthly_amount:1500,starts_on:"2026-10-01",ends_on:"2026-10-31",return_on:"2026-10-17",status:"ativo",routine:[{title:"Reunião",day:5}]};
  const props={workspace:{plan,generated:false,tasks:[]},canEdit:false,canGenerate:false,month:"2026-10",onMonth:()=>{},onSave:async()=>{},onGenerate:async()=>({created:1,existing:0}),formatDate:d=>d,money:v=>String(v),initialTitle:"Exemplo",today:"2026-10-18"};
  const html=renderToStaticMarkup(React.createElement(ConsultingMonthlyPlanCard,props));assert(html.includes("1500"));assert(html.includes('disabled=""'));assert(!/consultingPlans\./.test(html));assert(html.includes("Reunião"));
  const generated=renderToStaticMarkup(React.createElement(ConsultingMonthlyPlanCard,{...props,workspace:{plan,generated:true,tasks:[{id:"t1",title:"Rotina gerada",due_date:"2026-10-05",status:"concluida",deleted:false}]}}));assert(generated.includes("Rotina gerada"));assert(!/consultingPlans\./.test(generated));
  const list=renderToStaticMarkup(React.createElement(ConsultingPlansList,{data:{items:[{...plan,code:"PRJ-01",client_name:"Empresa",client_id:"r1"}],total:11,ending:1,expired:0,returns:1,today:"2026-10-18"},page:0,onPage:()=>{},onOpen:()=>{},formatDate:d=>d,money:v=>String(v)}));assert(list.includes("Empresa"));assert(list.includes("1 / 2"));assert(!/consultingPlans\./.test(list));
 }
});

test("exemplos distintos mostram valores e a prévia preserva datas civis em PT/EN/ES",async()=>{
 const {ConsultingPublicDemo}=await import("../src/components/consulting/consulting-public-demo.tsx");
 const {ConsultingRoutinePreview}=await import("../src/components/consulting/consulting-monthly-plan-card.tsx");
 const {buildConsultingDemo,buildConsultingDemoData}=await import("../src/lib/consulting-demo.ts");
 const state=buildConsultingDemo();
 assert.notEqual(state.monthlyPlans.c1.service_name,state.monthlyPlans.c2.service_name);
 assert.notDeepEqual(state.monthlyPlans.c1.routine,state.monthlyPlans.c2.routine);
 for(const language of ["pt","en","es"]){
  await i18n.changeLanguage(language);
  const html=renderToStaticMarkup(React.createElement(ConsultingPublicDemo,{module:"plans",data:buildConsultingDemoData(),consulting:state,setData:()=>{},setConsulting:()=>{},goTo:()=>{}}));
  assert(html.includes(i18n.t("consultingPlans.exampleService")));assert(html.includes(i18n.t("consultingPlans.exampleService2")));
  assert(html.includes(i18n.t("consultingPlans.perMonth")));assert(html.includes("Aurora Tecnologia"));assert(html.includes("Vale Verde"));
  assert(!/consultingPlans\./.test(html));
  const props={plan:{...state.monthlyPlans.c1,starts_on:"2027-02-10",ends_on:"2027-02-28",routine:[{title:"Reunião",day:5},{title:"Relatório",day:31}]},month:"2027-02",formatDate:d=>d};
  const preview=renderToStaticMarkup(React.createElement(ConsultingRoutinePreview,props));
  assert(preview.includes("2027-02-10"));assert(preview.includes("2027-02-28"));assert(!preview.includes("<button"));
  assert.equal(renderToStaticMarkup(React.createElement(ConsultingRoutinePreview,{...props,month:"2027-03"})),"");
 }
});

test("resumo do cliente renderiza texto seguro, revisão e download no sistema e na demo em três idiomas",async()=>{
 const {ConsultingSummaryCard}=await import("../src/components/consulting/consulting-summary-card.tsx");
 const {ConsultingPublicDemo}=await import("../src/components/consulting/consulting-public-demo.tsx");
 const {buildConsultingDemo,buildConsultingDemoData}=await import("../src/lib/consulting-demo.ts");
 for(const language of ["pt","en","es"]){
  await i18n.changeLanguage(language);
  const props={input:{company:"Empresa",client:"Cliente",code:"PRJ-1",stage:"Diagnóstico",title:'<script>alert("x")</script>',description:"Escopo\nCompleto",owner_name:null,due_date:null,return_on:null,today:"2026-10-20",deliveries:[]},formatDate:d=>d};
  const html=renderToStaticMarkup(React.createElement(ConsultingSummaryCard,props));
  assert(html.includes("&lt;script&gt;"));assert(!html.includes("<script>"));
  assert(html.includes(i18n.t("consultingSummary.download")));assert(html.includes(i18n.t("consultingSummary.snapshot")));
  assert(html.includes("<details"));assert(html.includes("<summary"));assert(!/consultingSummary\./.test(html));
  const state=buildConsultingDemo();state.projectProfiles.c1={title:"Objetivo atualizado",description:"Escopo atualizado",owner_name:"Ana",due_date:"2026-11-20"};
  const demo=renderToStaticMarkup(React.createElement(ConsultingPublicDemo,{module:"cases",data:buildConsultingDemoData(),consulting:state,setData:()=>{},setConsulting:()=>{},goTo:()=>{}}));
  assert(demo.includes("Escopo atualizado"));assert(demo.includes("2026"));assert(demo.includes(i18n.t("consultingSummary.demo")));
  assert.equal((demo.match(/<details/g)||[]).length,4);
  assert(!/consultingSummary\./.test(demo));
 }
});

test("prioridades em PT/EN/ES mantêm filtros, paginação e não exibem itens antigos ao trocar categoria",async()=>{
 const {ConsultingDayCard}=await import("../src/components/consulting/consulting-day-card.tsx");
 const {buildConsultingDay}=await import("../src/lib/consulting-day.ts");
 const source=Array.from({length:9},(_,i)=>({id:String(i),kind:"delivery",process_id:"p1",code:"PRJ-1",project_title:"Projeto",client_name:"Empresa",title:i===0?"<script>Texto</script>":`Entrega ${i}`,due_date:"2026-10-19"}));
 const data=buildConsultingDay("2026-10-20",source,"delivery",0);
 for(const language of ["pt","en","es"]){
  await i18n.changeLanguage(language);
  const props={data,kind:"delivery",page:0,onKind:()=>{},onPage:()=>{},onOpen:()=>{},formatDate:d=>d};
  const html=renderToStaticMarkup(React.createElement(ConsultingDayCard,props));
  assert.equal((html.match(/<article/g)||[]).length,6);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
  assert(html.includes("&lt;script&gt;"));assert(html.includes(i18n.t("consultingDay.page",{page:1,pages:2})));assert(html.includes(i18n.t("consultingDay.open")));
  assert(!/consultingDay\./.test(html));assert(!html.includes("<script>"));
  const changing=renderToStaticMarkup(React.createElement(ConsultingDayCard,{...props,kind:"followup",busy:true}));
  assert(!changing.includes("<article"));assert(changing.includes('aria-busy="true"'));assert(changing.includes(i18n.t("consultingDay.loading")));
  for(const kind of ["delivery","followup","project"]){
   const empty=renderToStaticMarkup(React.createElement(ConsultingDayCard,{...props,kind,data:buildConsultingDay("2026-10-20",[],kind,0)}));assert(empty.includes(i18n.t(`consultingDay.empty.${kind}`)));
  }
 }
});

test("modelos mostram prévia, confirmação de substituição e lista editável em PT/EN/ES",async()=>{
 const {ConsultingTemplatePicker}=await import("../src/components/consulting/consulting-template-picker.tsx");
 const {ConsultingDeliveryDraft}=await import("../src/components/consulting/consulting-delivery-draft.tsx");
 const {ConsultingTemplateDemo}=await import("../src/components/consulting/consulting-template-demo.tsx");
 const {consultingTemplate}=await import("../src/lib/consulting-templates.ts");
 for(const language of ["pt","en","es"]){
  await i18n.changeLanguage(language);
  const props={onApply:()=>{}};
  const preview=renderToStaticMarkup(React.createElement(ConsultingTemplatePicker,props));
  assert.equal((preview.match(/<option/g)||[]).length,3);assert.equal((preview.match(/<li /g)||[]).length,4);assert(preview.includes(i18n.t("consultingTemplates.models.advisory.objective")));assert(!preview.includes('type="checkbox"'));
  const replace=renderToStaticMarkup(React.createElement(ConsultingTemplatePicker,{...props,hasContent:true}));assert(replace.includes('type="checkbox"'));assert(replace.includes('disabled=""'));assert(replace.includes(i18n.t("consultingTemplates.replace")));
  const edit=renderToStaticMarkup(React.createElement(ConsultingDeliveryDraft,{titles:['<script>Entrega</script>','Outra entrega'],onChange:()=>{}}));assert(edit.includes('&lt;script&gt;'));assert(!edit.includes('<script>'));assert.equal((edit.match(/<input/g)||[]).length,2);assert(edit.includes(i18n.t("consultingTemplates.removeNumber",{number:1})));
  const invalid=renderToStaticMarkup(React.createElement(ConsultingDeliveryDraft,{titles:['ab','ab'],onChange:()=>{}}));assert(invalid.includes('aria-invalid="true"'));assert(invalid.includes(i18n.t("consultingTemplates.invalidDeliveries")));
  const form=renderToStaticMarkup(React.createElement(ConsultingTemplateDemo,{clients:[{id:'r1',name:'Aurora'}],onCreate:async()=>{},onCancel:()=>{}}));assert(form.includes('Aurora'));assert(form.includes(i18n.t("consultingTemplates.demoCreate")));assert(form.includes('disabled=""'));assert(form.includes('maxLength="160"'));
  assert(!/consultingTemplates\./.test(preview+replace+edit+form+invalid));
  assert.equal(consultingTemplate('advisory',i18n.t.bind(i18n)).deliveries.length,4);
 }
});

test("diagnóstico real e demonstração renderizam formulário acessível e exemplos em PT/EN/ES",async()=>{
 const {ConsultingDiagnosticCard,ConsultingDiagnosticForm}=await import('../src/components/consulting/consulting-diagnostic-card.tsx');
 const {ConsultingPublicDemo}=await import('../src/components/consulting/consulting-public-demo.tsx');
 const {emptyConsultingDiagnostic}=await import('../src/lib/consulting-diagnostic.ts');
 const {buildConsultingDemo,buildConsultingDemoData}=await import('../src/lib/consulting-demo.ts');
 const values={focus:'processes',priority:'high',situation:'<script>Privado</script>',attempts:'Texto\nCompleto',expected_result:'Organizar solicitações',target_on:'2026-11-20'};
 for(const language of ['pt','en','es']){
  await i18n.changeLanguage(language);
  const props={values,canEdit:false,onSave:async()=>{},formatDate:d=>d};
  const view=renderToStaticMarkup(React.createElement(ConsultingDiagnosticCard,props));
  assert(view.includes('&lt;script&gt;'));assert(!view.includes('<script>'));assert(!view.includes('<button'));assert(view.includes('2026-11-20'));
  const empty=renderToStaticMarkup(React.createElement(ConsultingDiagnosticCard,{...props,values:null,canEdit:true}));
  assert(empty.includes(i18n.t('consultingDiagnostic.empty')));assert(empty.includes(i18n.t('consultingDiagnostic.add')));
  for(const draft of [values,emptyConsultingDiagnostic()]){
   const form=renderToStaticMarkup(React.createElement(ConsultingDiagnosticForm,{values:draft,onSave:async()=>{},onCancel:()=>{}}));
   assert.equal((form.match(/<textarea/g)||[]).length,3);assert.equal((form.match(/<select/g)||[]).length,2);assert.equal((form.match(/<option/g)||[]).length,9);
   assert(form.includes('maxLength="2000"'));assert(form.includes('type="date"'));assert(form.includes('min-h-11'));
   if(!draft.situation)assert(form.includes('disabled=""'));
   assert(!/consultingDiagnostic\./.test(form));
  }
  const demo=renderToStaticMarkup(React.createElement(ConsultingPublicDemo,{module:'records',data:buildConsultingDemoData(),consulting:buildConsultingDemo(),setData:()=>{},setConsulting:()=>{},goTo:()=>{}}));
  assert(demo.includes(i18n.t('consultingDiagnostic.example.situation')));assert(demo.includes(i18n.t('consultingDiagnostic.edit')));assert(demo.includes('Aurora Tecnologia'));assert(!/consultingDiagnostic\./.test(demo));
  assert(!/consultingDiagnostic\./.test(view+empty));
 }
});

test("preparação de proposta real e demo exibem campos para revisão em PT/EN/ES",async()=>{
 const {ConsultingProposalDraft}=await import('../src/components/consulting/consulting-proposal-draft.tsx');
 const {ConsultingProposalPreparation}=await import('../src/components/consulting/consulting-proposal-preparation.tsx');
 const {ConsultingPublicDemo}=await import('../src/components/consulting/consulting-public-demo.tsx');
 const {proposalFromConsultingDiagnostic}=await import('../src/lib/consulting-proposal.ts');
 const {buildConsultingDemo,buildConsultingDemoData,saveConsultingDemoDiagnosticProposal}=await import('../src/lib/consulting-demo.ts');
 for(const language of ['pt','en','es']){
  await i18n.changeLanguage(language);
  const initial=proposalFromConsultingDiagnostic('<script>Resultado esperado</script>',i18n.t('consultingProposal.defaultTitle'));
  const form=renderToStaticMarkup(React.createElement(ConsultingProposalDraft,{initial,clientName:'Aurora Tecnologia',today:'2026-10-18',onSave:async()=>{},onCancel:()=>{}}));
  assert(form.includes('&lt;script&gt;'));assert(!form.includes('<script>'));assert(form.includes('disabled=""'));assert.equal((form.match(/type="date"/g)||[]).length,2);assert.equal((form.match(/<textarea/g)||[]).length,2);assert(form.includes(i18n.t('consultingProposal.serviceHint')));assert(form.includes('inputMode="decimal"'));assert(!form.includes('type="checkbox"'));
  const action=renderToStaticMarkup(React.createElement(ConsultingProposalPreparation,{expectedResult:'Resultado esperado',clientName:'Aurora',today:'2026-10-18',onSave:async()=>{},viewProposals:'Ver propostas'}));assert(action.includes(i18n.t('consultingProposal.prepare')));assert(!action.includes('<form'));
  const disabled=renderToStaticMarkup(React.createElement(ConsultingProposalPreparation,{expectedResult:'Resultado esperado',clientName:'Aurora',today:'2026-10-18',disabled:true,onSave:async()=>{},viewProposals:'Ver propostas'}));assert(disabled.includes('disabled=""'));
  const data=buildConsultingDemoData();let state=buildConsultingDemo();
  const props={data,consulting:state,setData:()=>{},setConsulting:()=>{},goTo:()=>{}};
  const records=renderToStaticMarkup(React.createElement(ConsultingPublicDemo,{...props,module:'records'}));assert(records.includes(i18n.t('consultingProposal.prepare')));
  state=saveConsultingDemoDiagnosticProposal(data,state,'r1',{...initial,title:'Texto literal da proposta',terms:'Condições revisadas',amount:'1500',firstDueDate:'2026-10-25',validUntil:'2026-10-28'},'diagnostic-render');
  const proposal=renderToStaticMarkup(React.createElement(ConsultingPublicDemo,{...props,consulting:state,module:'proposals'}));assert(proposal.includes('Texto literal da proposta'));assert(proposal.includes('Condições revisadas'));assert(proposal.includes(i18n.t('consultingProposal.edit')));assert(proposal.includes(i18n.t('consultingProposal.validUntil')));assert(!proposal.includes('Os pedidos chegam'));
  assert(!/consultingProposal\./.test(form+action+records+proposal+disabled));
 }
});
