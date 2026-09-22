import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261018160000_health_operational_alerts.sql",
  "utf8",
);
const notifications = readFileSync("src/lib/notifications.ts", "utf8");
const page = readFileSync("src/routes/_authenticated/notificacoes.tsx", "utf8");

describe("alertas automáticos do FLUXA Saúde", () => {
  test("reutiliza o relógio temporal sem criar novo cron", () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.run_temporal_automation_cycle/);
    assert.match(migration, /create_health_operational_notifications/);
    assert.doesNotMatch(migration, /cron\.schedule/);
  });

  test("preserva os lembretes Asaas no ciclo único", () => {
    assert.match(migration, /create_asaas_client_payment_notifications/);
    assert.match(migration, /asaas_client_payment_reminders_created/);
  });

  test("cobre autorização, lote vencido, prazo de glosa e índice de glosa", () => {
    assert.match(migration, /health-authorization:/);
    assert.match(migration, /health-batch-overdue:/);
    assert.match(migration, /health-denial-due:/);
    assert.match(migration, /health-insurer-denial-rate:/);
  });

  test("usa deduplicação e não expõe executor ao usuário autenticado", () => {
    assert.match(migration, /ON CONFLICT DO NOTHING/);
    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION public\.create_health_operational_notifications\(timestamptz\)[\s\S]*authenticated/,
    );
  });

  test("central de notificações reconhece a categoria Saúde", () => {
    assert.match(notifications, /"health"/);
    assert.match(page, /\["health", "Saúde"\]/);
  });
});
