import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260908120000_client_portal_document_center.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/067_client_portal_document_center.sql",
  "utf8",
);
const hook = readFileSync("src/hooks/use-client-portal-content.ts", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("central segura de documentos do Meu Portal", () => {
  test("documentos expõem apenas categoria, tipo e versão atual revisados", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_documents()");
    const signature = migration.slice(start, migration.indexOf(")\nLANGUAGE sql", start));
    assert.match(signature, /current_version integer/);
    assert.match(signature, /document_type_name text/);
    assert.match(signature, /category text/);
    assert.doesNotMatch(signature, /notes|reviewed|rejection|uploaded_by|issuer/i);
  });

  test("histórico de versões deriva a identidade e exige documento compartilhado", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_document_versions(");
    const body = migration.slice(start, start + 2800);
    assert.match(body, /access\.user_id = auth\.uid\(\)/);
    assert.match(body, /access\.is_active/);
    assert.match(body, /share\.document_id = _document_id/);
    assert.match(body, /share\.is_shared/);
    assert.doesNotMatch(body.slice(0, body.indexOf(")\nLANGUAGE")), /notes|uploaded_by|file_path/i);
    assert.match(databaseTest, /another client document history/);
    assert.match(databaseTest, /disabled portal access/);
  });

  test("frontend oferece busca e filtros por situação, processo e categoria", () => {
    assert.match(portal, /documentSearch/);
    assert.match(portal, /documentStatusFilter/);
    assert.match(portal, /documentProcessFilter/);
    assert.match(portal, /documentCategoryFilter/);
    assert.match(portal, /Buscar documento/);
    assert.match(portal, /Vencendo em 30 dias/);
  });

  test("documentos são agrupados por processo e alertam validade", () => {
    assert.match(portal, /filteredDocumentGroups/);
    assert.match(portal, /Processo \$\{document\.process_code\}/);
    assert.match(portal, /portalDocumentExpiration/);
    assert.match(portal, /Vence hoje/);
    assert.match(portal, /Vence em \$\{days\} dias/);
  });

  test("visualização, download e histórico são ações separadas", () => {
    assert.match(portal, /<Eye[\s\S]*Visualizar/);
    assert.match(portal, /<Download[\s\S]*Baixar/);
    assert.match(portal, /Histórico de versões/);
    assert.match(hook, /useClientPortalDocumentVersions/);
    assert.match(hook, /downloadName \? \{ download: downloadName \} : undefined/);
  });

  test("contratos do Supabase incluem a projeção de versões", () => {
    assert.match(types, /client_portal_document_versions: \{/);
    assert.match(types, /current_version: number/);
    assert.match(types, /document_type_name: string/);
    assert.match(types, /category: string/);
  });
});
