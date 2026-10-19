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
  for(const module of ["overview","attendance","proposals","cases","schedule"]){
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
