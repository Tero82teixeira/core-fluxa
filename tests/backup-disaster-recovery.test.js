import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("backup e recuperação de desastre", () => {
  test("runbook cobre todos os ativos e não confunde banco com Storage", async () => {
    const runbook = await readFile(
      new URL("../docs/operations/backup-and-disaster-recovery.md", import.meta.url),
      "utf8",
    );

    for (const required of [
      "RPO",
      "RTO",
      "Banco PostgreSQL",
      "Storage",
      "Código",
      "Configuração",
      "Integrações",
      "Edge Functions",
      "Kiwify",
      "Teste trimestral de restauração",
      "projeto Supabase temporário e isolado",
    ]) {
      assert.match(runbook, new RegExp(required));
    }

    assert.match(runbook, /Backups do banco não contêm os arquivos binários/);
    assert.match(runbook, /valores ficam em um gerenciador de senhas, nunca no GitHub/);
    assert.match(runbook, /Não restaurar toda a produção para corrigir um único registro/);
    assert.match(runbook, /É proibido usar produção como destino do primeiro ensaio/);
  });

  test("inventário é somente leitura e não coleta dados pessoais ou segredos", async () => {
    const inventory = await readFile(
      new URL("../scripts/admin/backup-readiness.sql", import.meta.url),
      "utf8",
    );

    for (const metric of [
      "database_size_bytes",
      "organizations",
      "organization_members",
      "auth_users",
      "documents",
      "document_versions",
      "storage_objects",
      "storage_bytes",
      "applied_migrations",
      "latest_migration",
      "scheduled_jobs",
    ]) {
      assert.match(inventory, new RegExp(`'${metric}'`));
    }

    assert.doesNotMatch(inventory, /\b(insert|update|delete|drop|alter|truncate|create)\b/i);
    assert.doesNotMatch(
      inventory,
      /email|full_name|phone|whatsapp|document_digits|service_role|secret|password/i,
    );
  });
});
