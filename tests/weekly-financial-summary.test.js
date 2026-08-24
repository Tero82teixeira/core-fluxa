import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260824230000_weekly_financial_summary.sql",
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

describe("resumo financeiro semanal", () => {
  test("executa somente na segunda-feira após 08:00 no fuso da organização", () => {
    assert.match(migration, /extract\(isodow FROM config\.local_now\) = 1/);
    assert.match(migration, /config\.local_now::time >= time '08:00'/);
    assert.match(migration, /pg_catalog\.pg_timezone_names/);
    assert.match(migration, /America\/Sao_Paulo/);
    assert.match(migration, /organization\.archived_at IS NULL/);
    assert.match(migration, /monitoring_show_financial, true/);
  });

  test("resume saldos abertos, vencidos, pagamentos e próximos sete dias", () => {
    assert.match(migration, /open_receivables/);
    assert.match(migration, /open_payables/);
    assert.match(migration, /overdue_count/);
    assert.match(migration, /overdue_amount/);
    assert.match(migration, /received_last_week/);
    assert.match(migration, /paid_last_week/);
    assert.match(migration, /upcoming_receivables/);
    assert.match(migration, /upcoming_payables/);
    assert.match(migration, /account_balance/);
    assert.match(migration, /transaction_payment\.reversed_at IS NULL/);
  });

  test("notifica somente gestão financeira ativa e não altera finanças", () => {
    assert.match(
      migration,
      /member\.role::text IN \(\s*'superadmin', 'proprietario', 'administrador', 'gestor'\s*\)/,
    );
    assert.match(migration, /member\.is_active/);
    assert.match(migration, /'Resumo financeiro semanal'/);
    assert.match(migration, /'financial'/);
    assert.match(migration, /'\/financeiro'/);
    assert.doesNotMatch(
      migration,
      /UPDATE public\.financial_|INSERT INTO public\.financial_|DELETE FROM public\.financial_/,
    );
  });

  test("é privado, idempotente e reutiliza o relógio único", () => {
    assert.match(migration, /weekly-financial-summary:/);
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.create_weekly_financial_summary_notifications[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
    );
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.create_weekly_financial_summary_notifications[\s\S]*TO postgres/,
    );
    assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
    assert.doesNotMatch(migration, /https?:\/\/|service_role_key|anon_key/i);
  });

  test("preserva todas as etapas anteriores e isola falhas", () => {
    for (const stage of [
      "process_due_scheduled_automations",
      "process_due_financial_recurrences",
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
    assert.match(migration, /create_weekly_financial_summary_notifications\(\)/);
    assert.match(migration, /WEEKLY_FINANCIAL_SUMMARY_SCAN_FAILED/);
    assert.match(migration, /weekly_financial_summaries_created/);
  });

  test("tipos e documentação expõem o comportamento", () => {
    assert.match(databaseTypes, /create_weekly_financial_summary_notifications:/);
    assert.match(docs, /Resumo financeiro semanal/);
    assert.match(docs, /segunda-feira/);
    assert.match(docs, /não movimenta saldo/);
  });
});
