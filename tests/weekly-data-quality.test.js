import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260825010000_weekly_data_quality_scan.sql",
    import.meta.url,
  ),
  "utf8",
);
const databaseTypes = readFileSync(
  new URL("../src/integrations/supabase/types.ts", import.meta.url),
  "utf8",
);
const docs = readFileSync(
  new URL("../docs/scheduled-automations.md", import.meta.url),
  "utf8",
);

describe("verificação semanal da qualidade dos dados", () => {
  test("executa somente na terça-feira após 08:00 no fuso da organização", () => {
    assert.match(migration, /\) = 2/);
    assert.match(migration, /::time >= time '08:00'/);
    assert.match(migration, /pg_catalog\.pg_timezone_names/);
    assert.match(migration, /America\/Sao_Paulo/);
    assert.match(migration, /organization\.archived_at IS NULL/);
  });

  test("verifica apenas inconsistências estruturais comprováveis", () => {
    const qualityIssues = migration.match(
      /\), quality_issues AS \(([\s\S]*?)\n  \), summaries AS \(/,
    )?.[1];

    assert.ok(qualityIssues, "a CTE quality_issues deve estar presente");

    for (const issue of [
      "organization_missing_owner",
      "task_completion_missing",
      "task_completion_stale",
      "task_inactive_assignee",
      "client_inactive_owner",
      "process_inactive_owner",
      "process_document_counter_invalid",
      "communication_inactive_assignee",
      "communication_client_mismatch",
      "document_client_mismatch",
      "financial_inactive_responsible",
      "financial_client_mismatch",
    ]) {
      assert.match(qualityIssues, new RegExp(issue));
    }
    assert.doesNotMatch(
      qualityIssues,
      /missing_due|unassigned|expired|overdue/,
    );
  });

  test("notifica somente gestão ativa e não altera cadastros", () => {
    assert.match(
      migration,
      /member\.role::text IN \(\s*'superadmin', 'proprietario', 'administrador', 'gestor'\s*\)/,
    );
    assert.match(migration, /member\.is_active/);
    assert.match(migration, /Qualidade dos dados: revisão necessária/);
    assert.match(migration, /Nenhum cadastro foi alterado automaticamente/);
    assert.doesNotMatch(
      migration,
      /(?:UPDATE|DELETE|INSERT INTO) public\.(?:organizations|organization_members|tasks|clients|processes|communication_threads|documents|financial_transactions)/,
    );
  });

  test("é privada, semanalmente idempotente e reutiliza o relógio único", () => {
    assert.match(migration, /weekly-data-quality:/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.create_weekly_data_quality_notifications[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.create_weekly_data_quality_notifications[\s\S]*TO postgres/,
    );
    assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
    assert.doesNotMatch(migration, /https?:\/\/|service_role_key|anon_key/i);
  });

  test("usa search_path restrito e não depende de tipos não qualificados", () => {
    assert.match(migration, /SET search_path = pg_catalog, public, pg_temp/);
    assert.doesNotMatch(migration, /\bapp_role\b/);
  });

  test("preserva todas as etapas anteriores e isola a nova varredura", () => {
    for (const stage of [
      "process_due_scheduled_automations",
      "process_due_financial_recurrences",
      "create_weekly_financial_summary_notifications",
      "create_critical_monitoring_notifications",
      "create_unassigned_monitoring_notifications",
      "create_deadline_reminder_notifications",
      "create_overdue_task_escalation_notifications",
      "create_stale_process_notifications",
      "create_overdue_communication_notifications",
      "create_expired_document_notifications",
      "create_overdue_financial_notifications",
    ]) {
      assert.match(migration, new RegExp(`${stage}\\(\\)`));
    }
    assert.match(migration, /create_weekly_data_quality_notifications\(\)/);
    assert.match(migration, /WEEKLY_DATA_QUALITY_SCAN_FAILED/);
    assert.match(migration, /weekly_data_quality_notifications_created/);
  });

  test("tipos e documentação expõem o comportamento", () => {
    assert.match(databaseTypes, /create_weekly_data_quality_notifications:/);
    assert.match(docs, /Qualidade dos dados/);
    assert.match(docs, /terça-feira/);
    assert.match(docs, /não corrige cadastros automaticamente/);
  });
});
