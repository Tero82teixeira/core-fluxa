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
test("painel e agenda públicos renderizam em PT, EN e ES sem autenticação", async () => {
  const { LegalPublicDemo, LegalDemoAgenda } =
    await import("../src/components/legal/legal-public-demo.tsx");
  const { buildDemoData } = await import("../src/lib/public-demo.ts");
  const { buildLegalDemo, toggleLegalDemoDeadline } = await import("../src/lib/legal-demo.ts");
  const data = buildDemoData("legal"),
    legal = buildLegalDemo();
  for (const [language, panel, calendar] of [
    ["pt", "Prazos prioritários", "compromissos no período"],
    ["en", "Priority deadlines", "commitments in this period"],
    ["es", "Plazos prioritarios", "compromisos en el período"],
  ]) {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(
      React.createElement(LegalPublicDemo, {
        module: "overview",
        data,
        legal,
        setData: () => {},
        setLegal: () => {},
        goTo: () => {},
      }),
    );
    assert(html.includes(panel));
    assert(html.includes("2026"));
    assert(!/legalDemo\.|demo\.data\./.test(html));
    const props = {
      data,
      legal,
      date: "2026-10-18",
      view: "week",
      page: 1,
      onDate: () => {},
      onView: () => {},
      onPage: () => {},
      onCase: () => {},
    };
    const agenda = renderToStaticMarkup(React.createElement(LegalDemoAgenda, props));
    assert(agenda.includes(`25 ${calendar}`));
    assert.equal((agenda.match(/<article/g) || []).length, 20);
    const second = renderToStaticMarkup(
      React.createElement(LegalDemoAgenda, { ...props, page: 2 }),
    );
    assert.equal((second.match(/<article/g) || []).length, 5);
    const changed = renderToStaticMarkup(
      React.createElement(LegalDemoAgenda, {
        ...props,
        legal: toggleLegalDemoDeadline(legal, "deadline-3"),
      }),
    );
    assert(changed.includes(`24 ${calendar}`));
    assert(!/legalDemo\.|demo\.data\./.test(agenda));
  }
});
