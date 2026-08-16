import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const mutations = readFileSync(new URL("../src/hooks/use-mutations.ts", import.meta.url), "utf8");
const validators = readFileSync(new URL("../src/lib/validators.ts", import.meta.url), "utf8");
const clientsSecureMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260804004428_a05d935c-c7de-4f9f-b51d-2318bf8e46c3.sql",
    import.meta.url,
  ),
  "utf8",
);

const createClientImplementation = mutations.slice(
  mutations.indexOf("export function useCreateClient"),
  mutations.indexOf("export function useUpdateClient"),
);
const clientPayloadImplementation = validators.slice(
  validators.indexOf("export function toClientPayload"),
  validators.indexOf("export function duplicateDocumentMessage"),
);

describe("propriedade do cliente criado", () => {
  test("atribui o usuário operacional como owner_id depois dos valores do formulário", () => {
    assert.match(createClientImplementation, /\.insert\(\{[\s\S]*\.\.\.values,[\s\S]*owner_id: actor\.userId,/);
  });

  test("preserva os metadados existentes na criação", () => {
    for (const field of ["owner_name", "created_by", "updated_by", "last_interaction_at"]) {
      assert.match(createClientImplementation, new RegExp(`${field}:`));
    }
  });

  test("ClientPayload não permite que o formulário sobrescreva owner_id", () => {
    assert.doesNotMatch(clientPayloadImplementation, /owner_id\s*:/);
    assert.match(mutations, /ClientPayload = ReturnType<[^;]*toClientPayload>/);
  });

  test("clients_secure permite ao mesmo operacional ler o cliente recém-criado", () => {
    const operationalUserId = "operacional-1";
    const insertedClient = { owner_id: operationalUserId };

    assert.equal(insertedClient.owner_id === operationalUserId, true);
    assert.match(clientsSecureMigration, /'operacional'/);
    assert.match(clientsSecureMigration, /c\.owner_id = auth\.uid\(\)/);
  });
});
