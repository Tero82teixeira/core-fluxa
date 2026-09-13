import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BACKUP_SECTIONS,
  auditActionLabel,
  backupFileName,
  safeBackupName,
} from "../src/lib/data-protection.ts";

const hook = readFileSync("src/hooks/use-data-protection.ts", "utf8");
const panel = readFileSync("src/components/security/data-protection-panel.tsx", "utf8");
const settings = readFileSync("src/routes/_authenticated/configuracoes.tsx", "utf8");

test("backup cobre os módulos essenciais sem exportar tabelas de segredos", () => {
  const tables = BACKUP_SECTIONS.map((section) => section.table);
  for (const required of [
    "clients_secure",
    "processes",
    "tasks",
    "documents",
    "financial_transactions",
    "communication_entries",
    "commercial_opportunities",
    "audit_logs",
  ])
    assert.ok(tables.includes(required), `${required} deve fazer parte da exportação`);
  for (const forbidden of [
    "asaas_connection_secrets",
    "asaas_connections",
    "kiwify_webhook_events",
    "push_subscriptions",
    "organization_invitations",
    "client_portal_invitations",
  ])
    assert.ok(!tables.includes(forbidden), `${forbidden} não pode fazer parte da exportação`);
  assert.equal(new Set(tables).size, tables.length);
});

test("arquivo recebe nome seguro e indicação de compactação", () => {
  assert.equal(safeBackupName("Contábil São José Ltda."), "contabil-sao-jose-ltda");
  assert.equal(
    backupFileName("Empresa Teste", "2026-09-12T20:00:00.000Z", true),
    "fluxa-backup-empresa-teste-2026-09-12T20-00-00-000Z.json.gz",
  );
});

test("exportação pagina dados, registra auditoria e informa limitações", () => {
  assert.match(hook, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
  assert.match(hook, /organization\.backup\.exported/);
  assert.match(hook, /record_count/);
  assert.match(hook, /document_notice/);
  assert.match(hook, /permission denied\|row-level security\|not allowed/);
  assert.match(hook, /restrictedSections\.push/);
  assert.match(hook, /restricted_section_count/);
  assert.match(hook, /Segredos, chaves de API, tokens e credenciais/);
});

test("segurança restringe a exportação e mantém a auditoria visível na própria empresa", () => {
  assert.match(settings, /DataProtectionPanel/);
  assert.match(settings, /canManage=\{canManageDataProtection\}/);
  assert.match(panel, /Somente proprietário e administrador podem gerar o arquivo completo/);
  assert.match(panel, /Gerar backup agora/);
  assert.match(panel, /Histórico de backups/);
  assert.match(panel, /Auditoria da empresa/);
  assert.match(panel, /seção\(ões\) interna\(s\) protegida\(s\) não foram incluídas/);
  assert.equal(auditActionLabel("organization.backup.exported"), "Backup exportado");
});
