import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  readWorkspacePreference,
  workspaceStorageKey,
  writeWorkspacePreference,
} from "../src/lib/workspace-preference.ts";
import { permissionsForRole, resolveSessionMembership } from "../src/lib/access-control.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const memberships = [
  { id: "h-own", organization_id: "heloiza", user_id: "user-h", role: "proprietario", is_active: true },
  { id: "h-ronaldo", organization_id: "ronaldo", user_id: "user-h", role: "operacional", is_active: true },
];

describe("preferência de workspace por usuário", () => {
  test("a seleção muda membership, role e permissões imediatamente", () => {
    const selected = resolveSessionMembership(memberships, "user-h", "ronaldo");
    assert.equal(selected?.organization_id, "ronaldo");
    assert.equal(selected?.role, "operacional");
    assert.equal(permissionsForRole(selected?.role ?? null).canManageTeam, false);

    const own = resolveSessionMembership(memberships, "user-h", "heloiza");
    assert.equal(own?.role, "proprietario");
    assert.equal(permissionsForRole(own?.role ?? null).canManageTeam, true);
  });

  test("a seleção sobrevive a um novo carregamento", () => {
    const storage = new MemoryStorage();
    writeWorkspacePreference(storage, "user-h", "ronaldo");
    assert.equal(readWorkspacePreference(storage, "user-h"), "ronaldo");
    assert.equal(resolveSessionMembership(memberships, "user-h", readWorkspacePreference(storage, "user-h"))?.role, "operacional");
  });

  test("troca de usuário isola as preferências", () => {
    const storage = new MemoryStorage();
    writeWorkspacePreference(storage, "user-h", "ronaldo");
    writeWorkspacePreference(storage, "user-r", "ronaldo");
    assert.equal(workspaceStorageKey("user-h"), "fluxa-workspace:user-h");
    assert.equal(readWorkspacePreference(storage, "user-h"), "ronaldo");
    assert.equal(readWorkspacePreference(storage, "user-r"), "ronaldo");
    assert.equal(readWorkspacePreference(storage, "unknown-user"), null);
  });

  test("não reutiliza a chave global legada em login de outro usuário", () => {
    const storage = new MemoryStorage();
    storage.setItem("fluxa-workspace", "workspace-from-previous-user");
    assert.equal(readWorkspacePreference(storage, "new-user"), null);
  });
});
