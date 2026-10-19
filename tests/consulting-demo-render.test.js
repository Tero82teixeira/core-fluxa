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
