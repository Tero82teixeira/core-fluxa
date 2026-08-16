import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  belongsToOrganization,
  canAccessWorkspace,
  filterByOrganization,
  hasAuthenticatedUser,
} from "../src/lib/access-control.ts";
import {
  DOCUMENT_STATUS,
  MAX_FILE_SIZE,
  MONITORING_SITUATION,
  buildStoragePath,
  fileExtension,
  formatFileSize,
  suggestExpiration,
  uploadDocumentWithRetry,
  validateFile,
} from "../src/lib/documents.ts";
import {
  CLIENT_STATUS,
  PROCESS_STAGE,
  TASK_OPEN_STATUSES,
  TASK_STATUS,
} from "../src/lib/domain.ts";
import { digits, isValidCNPJ, isValidCPF } from "../src/lib/format.ts";

describe("autenticação", () => {
  test("aceita identificador autenticado", () =>
    assert.equal(hasAuthenticatedUser("user-1"), true));
  test("rejeita sessão vazia", () => assert.equal(hasAuthenticatedUser("  "), false));
});
describe("workspace", () => {
  test("permite membro no workspace ativo", () =>
    assert.equal(canAccessWorkspace("user-1", ["org-a", "org-b"], "org-b"), true));
  test("nega organização sem vínculo", () =>
    assert.equal(canAccessWorkspace("user-1", ["org-a"], "org-b"), false));
  test("nega acesso sem autenticação", () =>
    assert.equal(canAccessWorkspace(null, ["org-a"], "org-a"), false));
});
describe("clientes", () => {
  test("remove pontuação", () => assert.equal(digits("123.456.789-09"), "12345678909"));
  test("valida CPF", () => assert.equal(isValidCPF("52998224725"), true));
  test("rejeita CPF repetido", () => assert.equal(isValidCPF("11111111111"), false));
  test("valida CNPJ", () => assert.equal(isValidCNPJ("11222333000181"), true));
  test("mantém status ativo", () => assert.equal(CLIENT_STATUS.ativo.tone, "success"));
});
describe("processos", () => {
  test("exigência é risco", () => assert.equal(PROCESS_STAGE.exigencia.tone, "danger"));
  test("finalização é sucesso", () => assert.equal(PROCESS_STAGE.finalizado.tone, "success"));
});
describe("documentos", () => {
  test("normaliza extensão", () => assert.equal(fileExtension("Contrato.PDF"), "pdf"));
  test("rejeita extensão", () =>
    assert.match(validateFile(new File(["x"], "malware.exe")), /Formato não aceito/));
  test("rejeita vazio", () =>
    assert.equal(
      validateFile(new File([], "vazio.pdf", { type: "application/pdf" })),
      "O arquivo está vazio.",
    ));
  test("rejeita tamanho excessivo", () =>
    assert.match(
      validateFile({ name: "grande.pdf", size: MAX_FILE_SIZE + 1, type: "application/pdf" }),
      /acima do limite/,
    ));
  test("formata tamanho", () => assert.equal(formatFileSize(2048), "2 KB"));
  test("calcula validade", () => assert.equal(suggestExpiration("2026-01-01", 30), "2026-01-31"));
  test("identifica aprovação", () => assert.equal(DOCUMENT_STATUS.aprovado.tone, "success"));
  test("upload funciona na primeira tentativa e mantém upsert desativado", async () => {
    const calls = [];
    const result = await uploadDocumentWithRetry({
      buildPath: () => ({ path: "path-1", storedFileName: "file-1.pdf" }),
      upload: async (path, options) => (calls.push({ path, options }), { error: null }),
      contentType: "application/pdf",
    });
    assert.equal(result.path, "path-1");
    assert.deepEqual(calls, [{ path: "path-1", options: { contentType: "application/pdf", upsert: false } }]);
  });
  test("colisão gera caminho diferente e a segunda tentativa funciona", async () => {
    let generated = 0;
    const paths = [];
    const result = await uploadDocumentWithRetry({
      buildPath: () => ({ path: `path-${++generated}`, storedFileName: `file-${generated}.pdf` }),
      upload: async (path) => {
        paths.push(path);
        return { error: paths.length === 1 ? { code: "KeyAlreadyExists" } : null };
      },
      contentType: "application/pdf",
    });
    assert.equal(result.path, "path-2");
    assert.deepEqual(paths, ["path-1", "path-2"]);
    assert.equal(new Set(paths).size, paths.length);
  });
  test("propaga a terceira colisão", async () => {
    const collision = { code: "KeyAlreadyExists", message: "The resource already exists" };
    let attempts = 0;
    await assert.rejects(
      uploadDocumentWithRetry({
        buildPath: () => ({ path: `path-${++attempts}`, storedFileName: `file-${attempts}.pdf` }),
        upload: async () => ({ error: collision }),
        contentType: "application/pdf",
      }),
      (error) => error === collision,
    );
    assert.equal(attempts, 3);
  });
  test("não repete erro diferente de colisão", async () => {
    const denied = { statusCode: "403", message: "RLS denied" };
    let attempts = 0;
    await assert.rejects(
      uploadDocumentWithRetry({
        buildPath: () => ({ path: `path-${++attempts}`, storedFileName: "file.pdf" }),
        upload: async () => ({ error: denied }),
        contentType: "application/pdf",
      }),
      (error) => error === denied,
    );
    assert.equal(attempts, 1);
  });
});
describe("monitoramento", () => {
  test("vencimento é crítico", () => assert.equal(MONITORING_SITUATION.vencido.tone, "danger"));
  test("regular é sucesso", () => assert.equal(MONITORING_SITUATION.regular.tone, "success"));
});
describe("tarefas", () => {
  test("concluída não está aberta", () =>
    assert.equal(TASK_OPEN_STATUSES.includes("concluida"), false));
  test("em andamento é informativa", () => assert.equal(TASK_STATUS.em_andamento.tone, "info"));
});
describe("isolamento por organização", () => {
  const rows = [
    { id: "a-1", organization_id: "org-a" },
    { id: "b-1", organization_id: "org-b" },
    { id: "a-2", organization_id: "org-a" },
  ];
  test("recurso não pertence a outra organização", () =>
    assert.equal(belongsToOrganization(rows[0], "org-b"), false));
  test("filtra sem vazamento", () =>
    assert.deepEqual(
      filterByOrganization(rows, "org-a").map(({ id }) => id),
      ["a-1", "a-2"],
    ));
  test("sem organização retorna vazio", () =>
    assert.deepEqual(filterByOrganization(rows, null), []));
  test("arquivo recebe prefixo organizacional", () =>
    assert.match(
      buildStoragePath({ organizationId: "org-a", clientId: "client-1", extension: "pdf" }).path,
      /^org-a\/clientes\/client-1\/.+\.pdf$/,
    ));
});
