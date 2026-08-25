import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260825061000_daily_operational_close_pluralization.sql",
  "utf8",
);

test("daily close uses singular and plural labels for every category", () => {
  for (const [field, singular, plural] of [
    ["completed_tasks", "tarefa", "tarefas"],
    ["completed_processes", "processo", "processos"],
    ["pending_tasks", "tarefa", "tarefas"],
    ["pending_processes", "processo", "processos"],
    ["pending_documents", "documento", "documentos"],
    ["pending_communications", "retorno", "retornos"],
    ["pending_financial", "conta", "contas"],
  ]) {
    assert.match(
      migration,
      new RegExp(
        `CASE candidate\\.${field}[\\s\\S]*WHEN 1 THEN '${singular}'[\\s\\S]*ELSE '${plural}'`,
      ),
    );
  }
});

test("pluralization patch preserves function security and behavior", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_operational_close_for_organization\(/,
  );
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(
    migration,
    /SET search_path = pg_catalog, public, pg_temp/,
  );
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /_dedupe_prefix \|\| ':' \|\| candidate\.user_id::text/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.create_operational_close_for_organization/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.create_operational_close_for_organization/,
  );
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
});
