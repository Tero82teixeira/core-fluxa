import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DEMO_AREA_MODULES, DEMO_AREAS, buildDemoData, isDemoArea } from "../src/lib/public-demo.ts";
import { resolveLanguage } from "../src/i18n/language.ts";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";

const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();

test("demo cobre todas as áreas reais do cadastro", () => {
  const segments = readFileSync("src/lib/organization-segments.ts", "utf8");
  for (const area of DEMO_AREAS) assert.match(segments, new RegExp(`key: "${area}"`));
  assert.equal(isDemoArea("health"), true);
  assert.equal(isDemoArea("hacker"), false);
});

test("saúde mostra agenda e não processos jurídicos; advocacia não mostra agenda clínica", () => {
  assert.ok(DEMO_AREA_MODULES.health.includes("schedule"));
  assert.ok(!DEMO_AREA_MODULES.health.includes("documents"));
  assert.ok(DEMO_AREA_MODULES.legal.includes("schedule"));
  assert.equal(buildDemoData("legal").schedule.length, 0);
  assert.ok(buildDemoData("health").cases.every((c) => c.titleKey.startsWith("demo.data.health.")));
});

test("demo pública é isolada da produção", () => {
  const route = readFileSync("src/routes/demo.tsx", "utf8");
  const lib = readFileSync("src/lib/public-demo.ts", "utf8");
  for (const src of [route, lib]) {
    assert.doesNotMatch(src, /integrations\/supabase|client\.server|useAuth|demo-store|use-operations/);
  }
  assert.match(readFileSync("src/lib/demo.ts", "utf8"), /DEMO_MODE = false/);
  assert.match(route, /Modo demonstração|demo\.banner/);
});

test("idiomas têm as mesmas chaves e PT é o padrão", () => {
  assert.deepEqual(keys(en), keys(pt));
  assert.deepEqual(keys(es), keys(pt));
  assert.equal(resolveLanguage(null, []), "pt");
  assert.equal(resolveLanguage(null, ["en-US"]), "en");
  assert.equal(resolveLanguage("es", ["en-US"]), "es");
  assert.equal(resolveLanguage("fr", ["de"]), "pt");
});

test("CTA do teste de 14 dias continua indo ao cadastro real e a demo fica ao lado", () => {
  const landing = readFileSync("src/routes/index.tsx", "utf8");
  assert.match(landing, /to="\/entrar" search=\{\{ mode: "signup" \}\}/);
  assert.match(landing, /to="\/demo"/);
});
