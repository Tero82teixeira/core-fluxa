import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const readProjectFile = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("backup manual no plano gratuito", () => {
  test("PowerShell bloqueia o repositório e não grava credenciais", async () => {
    const script = await readProjectFile("scripts/backup/backup-fluxa.ps1");

    assert.match(script, /StartsWith\(\$repositoryPrefix/);
    assert.match(script, /nunca devem ir para o GitHub/);
    assert.match(script, /Read-Host -Prompt \$Prompt -AsSecureString/);
    assert.match(script, /FLUXA_DATABASE_URL/);
    assert.match(script, /FLUXA_SERVICE_ROLE_KEY/);
    assert.match(script, /Get-Command docker/);
    assert.match(script, /docker info/);
    assert.match(script, /INCOMPLETO\.txt/);
    assert.match(script, /CONCLUIDO\.txt/);
    assert.match(script, /Get-FileHash -Algorithm SHA256/);
    assert.doesNotMatch(script, /service_role\s*=\s*["'][A-Za-z0-9_-]{20}/i);
  });

  test("exporta banco completo e Storage separadamente", async () => {
    const script = await readProjectFile("scripts/backup/backup-fluxa.ps1");
    const storage = await readProjectFile("scripts/backup/backup-storage.mjs");

    assert.match(script, /supabase db dump[\s\S]+--role-only/);
    assert.match(script, /supabase db dump[\s\S]+schema\.sql/);
    assert.match(script, /supabase db dump[\s\S]+--data-only/);
    assert.match(script, /backup-storage\.mjs/);
    assert.match(storage, /supabase\.storage\.listBuckets\(\)/);
    assert.match(storage, /storage-manifest\.json/);
    assert.match(storage, /createHash\("sha256"\)/);
    assert.match(storage, /flag: "wx"/);
    assert.doesNotMatch(storage, /console\.log\([^\n]*remotePath/);
  });

  test("documentação orienta rotina segura e deixa claras as limitações", async () => {
    const guide = await readProjectFile("docs/operations/manual-backup-free-plan.md");

    for (const required of [
      "uma vez por semana",
      "antes de migrations",
      "Nunca cole connection string",
      "Nunca salve o backup dentro da pasta do projeto FLUXA",
      "BitLocker",
      "Docker Desktop",
      "Session pooler",
      "dados de teste",
      "CONCLUIDO.txt",
      "INCOMPLETO.txt",
      "não contém `INCOMPLETO.txt`",
      "nunca diretamente sobre a produção",
    ]) {
      assert.match(guide, new RegExp(required, "i"));
    }
  });

  test("git ignora cópias locais por defesa adicional", async () => {
    const gitignore = await readProjectFile(".gitignore");
    assert.match(gitignore, /\.fluxa-backups\//);
    assert.match(gitignore, /fluxa-backup-\*\//);
    assert.match(gitignore, /fluxa-backup-\*\.zip/);
  });
});
