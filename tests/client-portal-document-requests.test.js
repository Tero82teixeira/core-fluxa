import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260905120000_client_portal_document_requests.sql",
  "utf8",
);
const management = readFileSync("src/components/clients/client-portal-panel.tsx", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const hook = readFileSync("src/hooks/use-client-portal-requests.ts", "utf8");

describe("solicitações de documentos no Meu Portal", () => {
  test("tabelas operacionais não ficam disponíveis diretamente ao navegador", () => {
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.client_portal_document_requests, public\.client_portal_upload_intents\s+FROM PUBLIC, anon, authenticated/,
    );
    assert.match(migration, /ALTER TABLE public\.client_portal_document_requests ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /ALTER TABLE public\.client_portal_upload_intents ENABLE ROW LEVEL SECURITY/);
  });

  test("gestão é restrita a proprietário e administrador", () => {
    assert.match(
      migration,
      /create_client_portal_document_request[\s\S]*ARRAY\['proprietario','administrador'\]/,
    );
    assert.match(
      migration,
      /set_client_portal_document_request_status[\s\S]*ARRAY\['proprietario','administrador'\]/,
    );
  });

  test("upload exige acesso ativo, intenção temporária e caminho exato", () => {
    assert.match(migration, /intent\.user_id = auth\.uid\(\)/);
    assert.match(migration, /intent\.file_path = _file_path/);
    assert.match(migration, /intent\.expires_at > now\(\)/);
    assert.match(migration, /request\.status = 'pending'/);
    assert.match(
      migration,
      /CREATE POLICY client_portal_documents_insert[\s\S]*can_upload_client_portal_document\(name\)/,
    );
  });

  test("arquivo é validado antes e depois do armazenamento", () => {
    assert.match(portal, /validateFile/);
    assert.match(hook, /prepare_client_portal_document_upload/);
    assert.match(hook, /finalize_client_portal_document_upload/);
    assert.match(migration, /expected_size BETWEEN 1 AND 20971520/);
    assert.match(migration, /UPLOADED_OBJECT_MISMATCH/);
    assert.match(migration, /object\.owner_id IS DISTINCT FROM auth\.uid\(\)::text/);
  });

  test("painel interno cria e acompanha solicitações", () => {
    assert.match(management, /Solicitações de documentos/);
    assert.match(management, /Criar solicitação/);
    assert.match(management, /Aguardando cliente/);
    assert.match(management, /Aguardando análise/);
  });

  test("Meu Portal ativa Pendências e oferece envio do arquivo", () => {
    assert.match(portal, /TabsTrigger value="pendencias"/);
    assert.doesNotMatch(portal, /TabsTrigger value="pendencias"[^>]*disabled/);
    assert.match(portal, /Enviar arquivo/);
    assert.match(portal, /ACCEPT_ATTRIBUTE/);
    assert.match(portal, /useSubmitClientPortalDocument/);
  });
});
