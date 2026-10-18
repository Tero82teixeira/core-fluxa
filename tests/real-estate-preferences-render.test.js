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
    const { CommercialPanel, CommercialFilterForm } =
      await import("../src/components/real-estate/commercial-panel.tsx");
    const { summarizeCommercialRows } = await import("../src/lib/real-estate-commercial.ts");
    const filters = {
      date_from: "2026-10-01",
      date_to: "2026-10-16",
      timezone: "America/Sao_Paulo",
      responsible: "",
    };
    const dashboard =
      renderToStaticMarkup(
        React.createElement(CommercialPanel, {
          data: summarizeCommercialRows([], filters),
          filters,
          onQueue: () => {},
        }),
      ) +
      renderToStaticMarkup(
        React.createElement(CommercialFilterForm, {
          initial: filters,
          responsibles: [],
          busy: false,
          onApply: () => {},
        }),
      );
    assert(dashboard.includes(i18n.t("realEstateDemo.commercial.apply")));
    assert.doesNotMatch(dashboard, /realEstateDemo\.(commercial|manual)\./);
    const { BusinessProfileCard, BusinessProfileForm } =
      await import("../src/components/real-estate/business-profile.tsx");
    const { VoiceSearch } = await import("../src/components/real-estate/voice-search.tsx");
    const { emptyBusinessProfile } = await import("../src/lib/real-estate-profile.ts");
    const profile = {
      ...emptyBusinessProfile(),
      agent_name: "Corretor Exemplo",
      bio: "<script>privado</script>",
    };
    const profileHtml = renderToStaticMarkup(
      React.createElement(BusinessProfileCard, {
        profile,
        company: "Imobiliária Exemplo",
        whatsapp: "5527999999999",
        url: "https://example.com/imoveis/token",
      }),
    );
    const formHtml = renderToStaticMarkup(
      React.createElement(BusinessProfileForm, {
        initial: profile,
        onSave: async () => {},
        onCancel: () => {},
      }),
    );
    const voiceHtml = renderToStaticMarkup(React.createElement(VoiceSearch, { onApply: () => {} }));
    assert(profileHtml.includes("https://wa.me/5527999999999"));
    assert(profileHtml.includes("&lt;script&gt;"));
    assert(!profileHtml.includes("<script>"));
    assert(formHtml.includes(i18n.t("realEstateDemo.profile.save")));
    assert(voiceHtml.includes(i18n.t("realEstateDemo.voice.open")));
    assert.doesNotMatch(profileHtml + formHtml + voiceHtml, /realEstateDemo\.(profile|voice)\./);
    const { MobileClientSummary } =
      await import("../src/components/real-estate/mobile-workspace.tsx");
    const { DirectClientVoice } =
      await import("../src/components/real-estate/direct-client-voice.tsx");
    const mobile = renderToStaticMarkup(
      React.createElement(MobileClientSummary, {
        data: {
          client: {
            id: "test",
            name: "<script>cliente</script>",
            status: "ativo",
            phone: "javascript:alert(1)",
          },
          total: 1,
          items: [
            {
              id: "p",
              kind: "proposal",
              title: "IMOV-001",
              status: "aceita",
              amount: 1600,
              purpose: "locacao",
              at: "2026-10-18T12:00:00Z",
            },
          ],
        },
      }),
    );
    const directVoice = renderToStaticMarkup(
      React.createElement(DirectClientVoice, { onSearch: () => {} }),
    );
    assert(mobile.includes(i18n.t("realEstateDemo.mobile.acceptedNotice")));
    assert(mobile.includes("&lt;script&gt;"));
    assert(!mobile.includes("javascript:"));
    assert(directVoice.includes(i18n.t("realEstateDemo.mobile.voice")));
    assert.doesNotMatch(mobile + directVoice, /realEstateDemo\.mobile\./);
    const { MobilePropertySearch } =
      await import("../src/components/real-estate/mobile-property-search.tsx");
    const { MobileSelectionPreview } =
      await import("../src/components/real-estate/mobile-property-selection.tsx");
    const { buildMobileDemo } = await import("../src/lib/real-estate-mobile-demo.ts");
    const { buildRealEstateDemo } = await import("../src/lib/real-estate-public-demo.ts");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const source = buildMobileDemo(buildRealEstateDemo());
    const mobileFilters = {
      search: "centro",
      type: "apartamento",
      purpose: "locacao",
      maxPrice: 2000,
    };
    const cache = new QueryClient();
    cache.setQueryData(
      ["real-estate-mobile-properties", source.scope, mobileFilters, 1],
      await source.properties(mobileFilters, 1),
    );
    const properties = renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: cache },
        React.createElement(MobilePropertySearch, {
          source,
          filters: mobileFilters,
          onFilters: () => {},
          ids: [],
          onIds: () => {},
          demo: true,
        }),
      ),
    );
    const selectedItems = await source.preview(["IMOV-002"]);
    selectedItems[0].listing.description = "<script>conteúdo público</script>";
    const selectedHtml = renderToStaticMarkup(
      React.createElement(MobileSelectionPreview, {
        items: selectedItems,
        demo: true,
        onRemove: () => {},
      }),
    );
    assert(properties.includes("IMOV-002"));
    assert(!properties.includes("IMOV-005"));
    assert(properties.includes(i18n.t("realEstateDemo.mobile.selectProperty")));
    assert(selectedHtml.includes("/demo/imoveis/sala.webp"));
    assert(selectedHtml.includes("&lt;script&gt;"));
    assert(!selectedHtml.includes("<script>"));
    const workspaceVoice = renderToStaticMarkup(
      React.createElement(DirectClientVoice, { mode: "workspace", onSearch: () => {} }),
    );
    assert(workspaceVoice.includes(i18n.t("realEstateDemo.mobile.voiceWorkspace")));
    assert.doesNotMatch(properties + selectedHtml + workspaceVoice, /realEstateDemo\.mobile\./);
    cache.clear();
    const { DemoInquiryQueue } =
      await import("../src/components/real-estate/demo-inquiry-queue.tsx");
    const { buildCommercialDemoInquiries } =
      await import("../src/lib/real-estate-demo-commercial.ts");
    const queue = renderToStaticMarkup(
      React.createElement(DemoInquiryQueue, {
        rows: buildCommercialDemoInquiries(),
        scopeIds: new Set(["PEDIDO-DEMO-001"]),
        onChange: () => {},
        onCreate: () => {},
        onAttach: () => {},
        onPreferences: () => {},
        properties: [],
      }),
    );
    assert(queue.includes("Marina Costa"));
    assert(
      !queue.includes("Rafael Souza"),
      "o filtro limita a apresentação sem retirar os demais atendimentos da coleção",
    );
  }
  hooks.deregister();
});
