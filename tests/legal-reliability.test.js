import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { legalToday, validLegalDate, legalAgendaRange } from "../src/lib/legal-agenda.ts";
import { refreshLegalQueries } from "../src/lib/legal-query-cache.ts";
import { readFileSync } from "node:fs";
test("agenda rejeita datas vazias ou impossíveis e preserva períodos civis", () => {
  for (const value of [
    "",
    undefined,
    "2026-02-30",
    "2026-13-01",
    "18/10/2026",
    "infinity",
    "1999-12-31",
    "2101-01-01",
  ])
    assert.equal(validLegalDate(value), false);
  assert.equal(validLegalDate("2028-02-29"), true);
  assert.throws(() => legalAgendaRange("", "day"));
  assert.equal(legalToday(new Date("2026-10-19T02:59:00Z")), "2026-10-18");
  assert.equal(legalToday(new Date("2026-10-19T03:00:00Z")), "2026-10-19");
  const week = legalAgendaRange("2026-10-18", "week");
  assert.equal(week.startDate, "2026-10-12");
  assert.equal(week.endDate, "2026-10-19");
  assert.equal(legalAgendaRange("2000-01-01", "week").startDate, "1999-12-27");
  const day = legalAgendaRange("2026-10-18", "day");
  assert.equal(day.endDate, "2026-10-19");
  assert.equal(new Date(day.from).getHours(), 0);
  assert.equal(new Date(day.to).getHours(), 0);
});
test("alterar audiência invalida ficha, agenda e painel só da organização correta", async () => {
  const client = new QueryClient();
  const keys = [
    ["legal-case-profile", "org", "case"],
    ["legal-agenda", "org", "from", "to"],
    ["legal-workspace", "org", "dashboard"],
    ["legal-workspace", "org", "agenda"],
    ["legal-workspace", "other", "agenda"],
  ];
  keys.forEach((key) => client.setQueryData(key, {}));
  await refreshLegalQueries(client, "org", "profile", "case");
  keys.forEach((key, index) => assert.equal(client.getQueryState(key).isInvalidated, index < 4));
  client.clear();
  const hook = readFileSync("src/hooks/use-legal-cases.ts", "utf8");
  assert.match(
    hook,
    /onSuccess: \(\) => refreshLegalQueries\(queryClient, organizationId, "profile", processId\)/,
  );
});
test("concluir ou reabrir prazo invalida as páginas e os indicadores", async () => {
  const client = new QueryClient();
  const keys = [
    ["legal-deadlines", "org", "case"],
    ["legal-workspace", "org", "agenda", 1],
    ["legal-workspace", "org", "agenda", 2],
    ["legal-workspace", "org", "dashboard"],
  ];
  keys.forEach((key) => client.setQueryData(key, {}));
  await refreshLegalQueries(client, "org", "deadline");
  keys.forEach((key) => assert.equal(client.getQueryState(key).isInvalidated, true));
  client.clear();
});
