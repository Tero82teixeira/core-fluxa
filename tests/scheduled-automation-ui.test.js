import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  scheduledWallTimeParts,
  scheduledWallTimeToIso,
} from "../src/lib/automations.ts";

const page = readFileSync("src/routes/_authenticated/automacoes.tsx", "utf8");
const hooks = readFileSync("src/hooks/use-automations.ts", "utf8");

test("wall-clock schedules preserve the selected timezone", () => {
  const now = new Date("2026-08-23T00:00:00.000Z");
  assert.equal(
    scheduledWallTimeToIso("2026-08-24", "08:00", "America/Sao_Paulo", now),
    "2026-08-24T11:00:00.000Z",
  );
  assert.equal(
    scheduledWallTimeToIso("2026-08-24", "08:00", "UTC", now),
    "2026-08-24T08:00:00.000Z",
  );
  assert.deepEqual(
    scheduledWallTimeParts("2026-08-24T11:00:00.000Z", "America/Sao_Paulo"),
    { date: "2026-08-24", time: "08:00" },
  );
  assert.equal(scheduledWallTimeToIso("2026-08-22", "08:00", "UTC", now), null);
  assert.equal(scheduledWallTimeToIso("2026-08-24", "08:00", "Invalid/Zone", now), null);
});

test("automation page offers a dedicated and complete scheduled flow", () => {
  assert.match(page, /Nova por evento/);
  assert.match(page, /Nova por horário/);
  assert.match(page, /Todos os dias/);
  assert.match(page, /A cada alguns dias/);
  assert.match(page, /Primeira execução/);
  assert.match(page, /America\/Sao_Paulo/);
  assert.match(page, /create_task/);
  assert.match(page, /create_notification/);
  assert.match(page, /add_audit_log/);
  assert.match(page, /Selecione o responsável da tarefa/);
  assert.match(page, /Selecione quem receberá a notificação/);
});

test("scheduled rows only use their dedicated mutation RPCs", () => {
  for (const hook of [
    "useCreateScheduledAutomation",
    "useUpdateScheduledAutomation",
    "useSetScheduledAutomationActive",
    "useArchiveScheduledAutomation",
  ]) {
    assert.match(page, new RegExp(hook));
  }
  assert.match(page, /r\.trigger_type === "scheduled"[\s\S]*setScheduledActive\.mutateAsync/);
  assert.match(page, /r\.trigger_type === "scheduled"[\s\S]*archiveScheduled\.mutateAsync/);
  assert.doesNotMatch(page + hooks, /functions\.invoke|service_role|SUPABASE_SERVICE/);
  assert.doesNotMatch(page, /cron\.|pg_cron|https?:\/\//);
});
