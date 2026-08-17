import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { permissionsForRole } from "../src/lib/access-control.ts";
import { canManageFinance, canViewFinance } from "../src/lib/finance.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260817130000_permission_hardening.sql", import.meta.url),
  "utf8",
);

describe("hardening de permissões", () => {
  test("proprietário, administrador e gestor mantêm acesso financeiro", () => {
    for (const role of ["proprietario", "administrador", "gestor"]) {
      assert.equal(canViewFinance(role), true);
      assert.equal(canManageFinance(role), true);
    }
  });

  test("operacional e visualizador não recebem acesso financeiro", () => {
    for (const role of ["operacional", "visualizador"]) {
      assert.equal(canViewFinance(role), false);
      assert.equal(canManageFinance(role), false);
    }
  });

  test("operacional mantém exportação de relatórios sem virar gestor", () => {
    const permissions = permissionsForRole("operacional");
    assert.equal(permissions.canExportReports, true);
    assert.equal(permissions.canManageTeam, false);
    assert.equal(permissions.canViewFinance, false);
  });

  test("visualizador permanece somente leitura e sem exportação financeira", () => {
    const permissions = permissionsForRole("visualizador");
    assert.equal(permissions.readOnly, true);
    assert.equal(permissions.canCreate, false);
    assert.equal(permissions.canEdit, false);
    assert.equal(permissions.canViewFinance, false);
    assert.equal(permissions.canExportReports, false);
  });

  test("papéis reservados não recebem capacidades operacionais pela UI", () => {
    for (const role of ["atendimento", "financeiro", "cliente_externo"]) {
      const permissions = permissionsForRole(role);
      assert.equal(permissions.readOnly, true);
      assert.equal(permissions.canCreate, false);
      assert.equal(permissions.canEdit, false);
      assert.equal(permissions.canManageTasks, false);
      assert.equal(permissions.canManageMonitoring, false);
    }
  });

  test("RLS financeiro remove exceção por vínculo do operacional", () => {
    assert.match(
      migration,
      /CREATE POLICY financial_transactions_read[\s\S]*ARRAY\['superadmin','proprietario','administrador','gestor'\]/,
    );
    assert.doesNotMatch(migration, /responsible_user_id\s*=\s*auth\.uid\(\)/);
    assert.doesNotMatch(migration, /'visualizador'[^\n]*financial_transactions_read/);
  });

  test("todas as estruturas financeiras usam a mesma lista de leitores", () => {
    for (const policy of [
      "financial_categories_read",
      "financial_accounts_read",
      "financial_transactions_read",
      "financial_payments_read",
      "financial_recurrences_read",
      "financial_movements_read",
    ]) {
      const block = migration.slice(
        migration.indexOf(`CREATE POLICY ${policy}`),
        migration.indexOf(";", migration.indexOf(`CREATE POLICY ${policy}`)) + 1,
      );
      assert.match(block, /'superadmin','proprietario','administrador','gestor'/);
      assert.doesNotMatch(block, /'operacional'|'visualizador'/);
    }
  });

  test("documentos protegem aprovação, arquivamento e proveniência no banco", () => {
    for (const marker of [
      "DOCUMENT_SENSITIVE_UPDATE_DENIED",
      "DOCUMENT_PROVENANCE_IMMUTABLE",
      "DOCUMENT_REVIEW_PROVENANCE_IMMUTABLE",
      "documents_guard_sensitive_fields_trg",
    ]) {
      assert.match(migration, new RegExp(marker));
    }
  });

  test("nova versão operacional é explicitamente tratada e volta para análise", () => {
    assert.match(migration, /NEW\.current_version = OLD\.current_version \+ 1/);
    assert.match(migration, /NEW\.status = 'em_analise'/);
    assert.match(migration, /NEW\.uploaded_by := auth\.uid\(\)/);
    assert.match(migration, /NEW\.reviewed_by := NULL/);
  });

  test("versão de documento valida organização e autoria", () => {
    assert.match(migration, /DOCUMENT_VERSION_ORG_MISMATCH/);
    assert.match(migration, /document_versions_guard_insert_trg/);
    assert.match(
      migration,
      /ARRAY\['superadmin','proprietario','administrador','gestor','operacional'\]::public\.app_role\[\]/,
    );
  });

  test("catálogo reflete exportação operacional e equipe somente administrativa", () => {
    assert.match(migration, /'operacional'::public\.app_role, 'reports\.export'/);
    assert.match(migration, /role = 'gestor'::public\.app_role[\s\S]*permission_key = 'team\.manage'/);
  });
});
