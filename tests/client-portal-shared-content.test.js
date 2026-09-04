import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260904120000_client_portal_shared_content.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/060_client_portal_shared_content.sql",
  "utf8",
);
const management = readFileSync("src/components/clients/client-portal-panel.tsx", "utf8");
const hook = readFileSync("src/hooks/use-client-portal-content.ts", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("conteúdo compartilhado do Portal do Cliente", () => {
  test("novos processos e documentos continuam privados por padrão", () => {
    assert.match(migration, /COALESCE\(share\.is_shared, false\)/);
    assert.match(migration, /client_portal_process_shares/);
    assert.match(migration, /client_portal_document_shares/);
    assert.doesNotMatch(
      migration,
      /INSERT INTO public\.client_portal_(?:process|document)_shares[^;]*\bSELECT\b/i,
    );
  });

  test("somente proprietário e administrador gerenciam compartilhamentos", () => {
    assert.match(
      migration,
      /client_portal_share_management[\s\S]*ARRAY\['proprietario', 'administrador'\]/,
    );
    assert.match(
      migration,
      /set_client_portal_item_shared[\s\S]*ARRAY\['proprietario', 'administrador'\]/,
    );
    assert.match(databaseTest, /a manager cannot share portal content/);
  });

  test("RPCs do portal derivam a identidade autenticada e exigem acesso ativo", () => {
    for (const name of ["client_portal_processes", "client_portal_documents"]) {
      const start = migration.indexOf(`FUNCTION public.${name}()`);
      assert.notEqual(start, -1);
      const body = migration.slice(start, start + 3200);
      assert.match(body, /access\.user_id = auth\.uid\(\)/);
      assert.match(body, /access\.is_active/);
      assert.doesNotMatch(body, new RegExp(`${name}\\([^)]*(?:uuid|text)`));
    }
  });

  test("projeção de processos não contém notas, responsáveis nem financeiro", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_processes()");
    const signature = migration.slice(start, migration.indexOf(")\nLANGUAGE sql", start));
    assert.doesNotMatch(signature, /notes|description|owner|financial|value/i);
  });

  test("projeção de documentos não contém notas, revisão ou rejeição interna", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_documents()");
    const signature = migration.slice(start, migration.indexOf(")\nLANGUAGE sql", start));
    assert.doesNotMatch(signature, /notes|reviewed|rejection|uploaded_by/i);
  });

  test("download usa bucket privado e autorização vinculada ao compartilhamento", () => {
    assert.match(
      migration,
      /CREATE POLICY client_portal_documents_select[\s\S]*can_access_client_portal_document\(name\)/,
    );
    assert.match(
      hook,
      /\.from\("organization-documents"\)[\s\S]*\.createSignedUrl\(filePath, 60\)/,
    );
  });

  test("frontend administrativo oferece controles explícitos por item", () => {
    assert.match(management, /Conteúdo visível no portal/);
    assert.match(management, /Tudo começa privado/);
    assert.match(hook, /set_client_portal_item_shared/);
    assert.match(management, /Visível/);
    assert.match(management, /Privado/);
  });

  test("Meu Portal tem menu próprio e não consulta tabelas operacionais", () => {
    for (const label of [
      "Início",
      "Processos",
      "Documentos",
      "Pendências",
      "Comunicação",
      "Notificações",
    ]) {
      assert.match(portal, new RegExp(label));
    }
    assert.match(portal, /useClientPortalProcesses/);
    assert.match(portal, /useClientPortalDocuments/);
    assert.doesNotMatch(
      portal,
      /\.from\(["'](?:processes|documents|tasks|financial_transactions)["']\)/,
    );
    assert.doesNotMatch(
      hook,
      /\.from\(["'](?:processes|documents|tasks|financial_transactions)["']\)/,
    );
  });

  test("tipos gerados incluem tabelas e contratos novos", () => {
    for (const required of [
      "client_portal_process_shares",
      "client_portal_document_shares",
      "client_portal_share_management",
      "set_client_portal_item_shared",
      "client_portal_processes",
      "client_portal_documents",
      "can_access_client_portal_document",
    ]) {
      assert.match(types, new RegExp(required));
    }
  });

  test("banco cobre isolamento, acesso desativado, revogação e auditoria", () => {
    for (const required of [
      "all existing content starts private",
      "another client cannot be shared",
      "another organization document",
      "disabled access cannot read",
      "revocation is retained as history",
      "share revocation is audited",
    ]) {
      assert.match(databaseTest, new RegExp(required, "i"));
    }
  });
});
