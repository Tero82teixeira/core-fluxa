import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildDemoData, DEMO_AREA_MODULES } from "../src/lib/public-demo.ts";
import {
  buildLegalDemo,
  summarizeLegalDemo,
  legalDemoAgenda,
  updateLegalDemoHearing,
  toggleLegalDemoDeadline,
} from "../src/lib/legal-demo.ts";
const range = ["2026-10-12", "2026-10-19"];
test("painel fictício conta prazos gerais e individuais, sem depender do relógio", () => {
  const data = buildDemoData("legal"),
    legal = buildLegalDemo(),
    summary = summarizeLegalDemo(data, legal);
  assert.deepEqual(
    [summary.active, summary.overdue, summary.today, summary.nextSeven, summary.urgent.length],
    [4, 14, 6, 1, 21],
  );
  assert.equal(summary.requirement, 1);
  assert.equal(summary.withoutOwner, 1);
  const current = legal.deadlines.find((d) => d.status === "open" && d.date === "2026-10-18");
  const changed = toggleLegalDemoDeadline(legal, current.id);
  assert.equal(summarizeLegalDemo(data, changed).today, 5);
  assert.equal(legalDemoAgenda(data, changed, ...range, 1).total, 24);
  assert.equal(summarizeLegalDemo(data, toggleLegalDemoDeadline(changed, current.id)).today, 6);
  assert.equal(
    legal.deadlines.find((d) => d.id === current.id).status,
    "open",
    "não altera a fixture original",
  );
});
test("agenda pagina todos os compromissos e mantém contadores do período", () => {
  const data = buildDemoData("legal"),
    legal = buildLegalDemo();
  const first = legalDemoAgenda(data, legal, ...range, 1),
    second = legalDemoAgenda(data, legal, ...range, 2);
  assert.deepEqual(
    [
      first.total,
      first.items.length,
      second.items.length,
      first.hearings,
      first.deadlines,
      first.tasks,
    ],
    [25, 20, 5, 3, 20, 2],
  );
  assert.equal(new Set([...first.items, ...second.items].map((x) => x.id)).size, 25);
  assert.deepEqual(first, legalDemoAgenda(data, legal, ...range, 1));
  assert.equal(legalDemoAgenda(data, legal, "2026-12-01", "2026-12-02", 2).page, 1);
});
test("mudar audiência reflete imediatamente, e concluir processo retira suas pendências", () => {
  const data = buildDemoData("legal"),
    legal = buildLegalDemo();
  const changed = updateLegalDemoHearing(legal, "hearing-1", "2026-10-20T15:30");
  assert.equal(legalDemoAgenda(data, changed, ...range, 1).hearings, 2);
  assert.equal(legalDemoAgenda(data, changed, "2026-10-20", "2026-10-21", 1).hearings, 1);
  assert.equal(legal.hearings[0].at, "2026-10-18T09:00");
  for (const at of ["", "2026-02-30T10:00", "2026-10-18T25:00", "2026-10-18T10:61", "infinity"])
    assert.equal(updateLegalDemoHearing(legal, "hearing-1", at), legal);
  const completed = {
    ...data,
    cases: data.cases.map((c) => (c.id === "c1" ? { ...c, status: "done" } : c)),
  };
  assert.equal(summarizeLegalDemo(completed, legal).active, 3);
  assert.equal(legalDemoAgenda(completed, legal, ...range, 2).page, 1);
  assert(!legalDemoAgenda(completed, legal, ...range, 1).items.some((e) => e.caseId === "c1"));
  const cancelled = legal.deadlines.find((d) => d.status === "cancelled");
  assert.equal(
    toggleLegalDemoDeadline(legal, cancelled.id).deadlines.find((d) => d.id === cancelled.id)
      .status,
    "cancelled",
  );
});
test("demo jurídica não consulta nem altera dados reais e não interfere nas outras áreas", () => {
  assert(DEMO_AREA_MODULES.legal.includes("schedule"));
  for (const name of ["src/lib/legal-demo.ts", "src/components/legal/legal-public-demo.tsx"]) {
    const text = readFileSync(name, "utf8");
    assert.doesNotMatch(
      text,
      /supabase|fetch\(|localStorage|sessionStorage|useAuth|use-legal-cases|use-operations|useWorkspace/,
    );
  }
  const route = readFileSync("src/routes/demo.tsx", "utf8");
  assert.match(route, /area === "legal" && \["overview", "schedule", "cases"\]/);
  assert.equal(buildDemoData("health").schedule.length, 4);
  assert.equal(buildDemoData("real_estate").cases[0].code, "IMV-2026-0041");
  assert.deepEqual(buildLegalDemo(), buildLegalDemo(), "cada abertura recebe fixtures novas");
});
