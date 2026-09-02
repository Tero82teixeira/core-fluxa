import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260902120000_client_portal_access_foundation.sql",
  import.meta.url,
);
const databaseTestUrl = new URL(
  "../supabase/tests/database/058_client_portal_access_foundation.sql",
  import.meta.url,
);

describe("fundação segura do Portal do Cliente", () => {
  test("mantém clientes externos separados da equipe e do limite de cinco vagas", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    assert.match(migration, /CREATE TABLE public\.client_portal_access/);
    assert.match(migration, /CREATE TABLE public\.client_portal_invitations/);
    assert.doesNotMatch(
      migration,
      /INSERT INTO public\.organization_members[\s\S]*cliente_externo/i,
    );
    assert.doesNotMatch(migration, /enforce_organization_member_limit/);
    assert.match(migration, /PORTAL_IDENTITY_CONFLICT/);
  });

  test("não concede leitura ampla das tabelas operacionais", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    for (const table of ["clients", "processes", "documents", "financial_transactions"]) {
      assert.doesNotMatch(migration, new RegExp(`CREATE POLICY[^;]+ON public\\.${table}`, "i"));
    }
    assert.match(migration, /has_client_portal_access/);
    assert.match(migration, /access\.user_id = auth\.uid\(\)/);
    assert.match(migration, /client\.archived_at IS NULL/);
    assert.match(migration, /organization\.archived_at IS NULL/);
  });

  test("fecha escrita direta e protege criação acidental de workspace", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.client_portal_access FROM PUBLIC, anon, authenticated/,
    );
    assert.match(migration, /BOOTSTRAP_CLIENT_PORTAL_ACCOUNT/);
    assert.match(migration, /BOOTSTRAP_CLIENT_PORTAL_INVITATION_PENDING/);
    assert.match(migration, /organizations_client_portal_bootstrap_guard/);
    assert.match(migration, /GRANT EXECUTE[\s\S]+TO anon, authenticated/);
  });

  test("teste de banco cobre isolamento, aceite, conflito e desativação", async () => {
    const databaseTest = await readFile(databaseTestUrl, "utf8");

    for (const required of [
      "does not reserve one of the five team seats",
      "has no access to another client",
      "does not expose internal client rows",
      "cannot silently create an internal workspace",
      "PORTAL_IDENTITY_CONFLICT",
      "deactivation immediately removes",
    ]) {
      assert.match(databaseTest, new RegExp(required, "i"));
    }
  });
});
