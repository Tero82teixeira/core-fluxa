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
test("preferências carregam traduções ao abrir diretamente no sistema, sem visitar demo", async () => {
  assert(!i18n.isInitialized, "o teste começa sem inicialização feita por outra página");
  const { PreferencesForm, PreferenceSelection } =
    await import("../src/components/real-estate/preference-selection.tsx");
  const { emptyPreferences } = await import("../src/lib/real-estate-preferences.ts");
  assert(i18n.isInitialized);
  for (const [language, save, matches] of [
    ["pt", "Salvar preferências e buscar", "Imóveis compatíveis"],
    ["en", "Save preferences and search", "Matching properties"],
    ["es", "Guardar preferencias y buscar", "Inmuebles compatibles"],
  ]) {
    await i18n.changeLanguage(language);
    const form = renderToStaticMarkup(
      React.createElement(PreferencesForm, {
        initial: emptyPreferences("locacao"),
        writable: true,
        busy: false,
        onSave: async () => {},
      }),
    );
    const selection = renderToStaticMarkup(
      React.createElement(PreferenceSelection, {
        items: [],
        total: 0,
        page: 1,
        onPage: () => {},
        only: true,
        onOnly: () => {},
        selected: [],
        onSelect: () => {},
        link: "",
        onGenerate: async () => {},
        busy: false,
        purpose: "locacao",
      }),
    );
    assert(form.includes(save));
    assert(selection.includes(matches));
    assert.doesNotMatch(form + selection, /realEstateDemo\.preferences\./);
    const { ManualAttendanceForm } =
      await import("../src/components/real-estate/manual-attendance-form.tsx");
    const manual = renderToStaticMarkup(
      React.createElement(ManualAttendanceForm, {
        responsibles: [{ id: "demo", name: "Equipe Exemplo" }],
        initialResponsible: "demo",
        busy: false,
        onCreate: async () => {},
      }),
    );
    assert.equal(
      (manual.match(/<form/g) || []).length,
      1,
      "cadastro e preferências usam um único formulário",
    );
    assert.doesNotMatch(manual, /realEstateDemo\.(preferences|manual)\./);
    assert(manual.includes(i18n.t("realEstateDemo.manual.create")));
  }
  hooks.deregister();
});
