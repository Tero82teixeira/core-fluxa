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
  isStorageKeyAlreadyExists,
  suggestExpiration,
  uploadWithFreshStoragePath,
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
  test("reconhece colisão KeyAlreadyExists do Storage", () =>
    assert.equal(
      isStorageKeyAlreadyExists({
        statusCode: "409",
        error: "Duplicate",
        message: "The resource already exists",
        code: "KeyAlreadyExists",
      }),
      true,
    ));
  test("não confunde erro de permissão com colisão", () =>
    assert.equal(isStorageKeyAlreadyExists({ statusCode: "403", message: "Unauthorized" }), false));
  test("gera novo caminho e tenta novamente após colisão", async () => {
    const locations = [
      { path: "org/clientes/a/duplicado.pdf", storedFileName: "duplicado.pdf" },
      { path: "org/clientes/a/novo.pdf", storedFileName: "novo.pdf" },
    ];
    const attempted = [];
    let locationIndex = 0;

    const result = await uploadWithFreshStoragePath(
      () => locations[locationIndex++],
      async (path) => {
        attempted.push(path);
        return attempted.length === 1
          ? { error: { code: "KeyAlreadyExists", message: "The resource already exists", statusCode: "409" } }
          : { error: null };
      },
    );

    assert.equal(result.path, "org/clientes/a/novo.pdf");
    assert.deepEqual(attempted, ["org/clientes/a/duplicado.pdf", "org/clientes/a/novo.pdf"]);
  });
  test("não repete upload para erro diferente de colisão", async () => {
    let attempts = 0;
    await assert.rejects(
      uploadWithFreshStoragePath(
        () => ({ path: `org/arquivo-${attempts}.pdf`, storedFileName: `arquivo-${attempts}.pdf` }),
        async () => {
          attempts += 1;
          return { error: new Error("permission denied") };
        },
      ),
      /permission denied/,
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
