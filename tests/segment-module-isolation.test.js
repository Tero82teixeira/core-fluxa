import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const segments = readFileSync("src/lib/organization-segments.ts", "utf8");
const settings = readFileSync("src/components/settings/segment-modules-settings.tsx", "utf8");
const authenticatedLayout = readFileSync("src/routes/_authenticated.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261018230000_segment_module_isolation.sql",
  "utf8",
);
const generatedTypes = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("isolamento de módulos por segmento", () => {
  test("não libera rotas verticais quando o segmento está ausente", () => {
    assert.doesNotMatch(segments, /if \(!businessSegment\) return true/);
    assert.match(
      segments,
      /if \(!moduleAllowedForSegment\(module, businessSegment\)\) return false/,
    );
    assert.match(segments, /catalogEntry\.group === businessSegment/);
  });

  test("mostra e salva somente módulos compatíveis com o segmento", () => {
    assert.match(settings, /modulesAvailableForSegment\(segment\)/);
    assert.match(settings, /moduleAllowedForSegment\(key, segment\)/);
    assert.match(settings, /sanitizeModulesForSegment\(segment, enabled\)/);
    assert.doesNotMatch(settings, /MODULE_CATALOG\.map/);
  });

  test("bloqueia o conteúdo da rota antes do redirecionamento", () => {
    assert.match(authenticatedLayout, /const moduleRouteAllowed =/);
    assert.match(authenticatedLayout, /moduleRouteAllowed \? \(/);
    assert.match(authenticatedLayout, /Redirecionando para uma área disponível/);
  });

  test("valida o isolamento também no banco", () => {
    assert.match(migration, /organization_modules_are_valid/);
    assert.match(migration, /WHEN 'health_appointments' THEN _segment IS DISTINCT FROM 'health'/);
    assert.match(migration, /organization_settings_segment_modules_check/);
    assert.match(migration, /RAISE EXCEPTION 'SEGMENT_MODULES_INVALID'/);
    assert.match(generatedTypes, /organization_modules_are_valid/);
  });

  test("preserva o núcleo e remove apenas módulos antigos incompatíveis", () => {
    assert.match(migration, /WHEN 'clients' THEN true/);
    assert.match(migration, /WHEN 'health_patients' THEN settings\.business_segment = 'health'/);
    assert.match(migration, /Módulos do núcleo e dados existentes permanecem intactos/);
  });
});
