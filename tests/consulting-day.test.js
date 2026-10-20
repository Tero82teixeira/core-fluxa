import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildConsultingDay, consultingDayHorizon } from "../src/lib/consulting-day.ts";
import {
  buildConsultingDemo,
  buildConsultingDemoData,
  consultingDemoDay,
  saveConsultingDemoDelivery,
  saveConsultingDemoPlan,
} from "../src/lib/consulting-demo.ts";

const item = (id, kind, due_date) => ({
  id,
  kind,
  due_date,
  process_id: "p1",
  title: id,
  code: "PRJ-1",
  project_title: "Projeto",
  client_name: "Empresa",
});
test("prioridades usam datas civis, sete dias inclusivos e não confundem entrega de hoje com atraso", () => {
  assert.equal(consultingDayHorizon("2026-12-28"), "2027-01-04");
  assert.equal(consultingDayHorizon("2028-02-25"), "2028-03-03");
  for (const date of ["", "2026-02-30", "2026-2-03"])
    assert.throws(() => consultingDayHorizon(date));
  const source = [
      item("a", "delivery", "2026-10-19"),
      item("b", "delivery", "2026-10-20"),
      item("c", "followup", "2026-10-20"),
      item("d", "followup", "2026-10-27"),
      item("e", "followup", "2026-10-28"),
      item("f", "project", "2026-10-19"),
      item("g", "project", ""),
      item("h", "project", "2026-02-30"),
    ],
    before = structuredClone(source);
  const day = buildConsultingDay("2026-10-20", source, "delivery", 0);
  assert.deepEqual(day.counts, { delivery: 1, followup: 2, project: 1 });
  assert.deepEqual(
    day.items.map((x) => x.id),
    ["a"],
  );
  assert.deepEqual(source, before);
  assert.throws(() => buildConsultingDay(day.today, source, "other", 0));
  assert.throws(() => buildConsultingDay(day.today, source, "delivery", -1));
});
test("paginação preserva totais completos e desempate estável sem duplicações", () => {
  const source = Array.from({ length: 14 }, (_, i) =>
    item(String(i).padStart(2, "0"), "delivery", "2026-10-10"),
  ).reverse();
  const pages = [0, 1, 2].map((page) => buildConsultingDay("2026-10-20", source, "delivery", page));
  assert.deepEqual(
    pages.map((p) => p.total),
    [14, 14, 14],
  );
  assert.deepEqual(
    pages.map((p) => p.items.length),
    [6, 6, 2],
  );
  assert.equal(new Set(pages.flatMap((p) => p.items.map((i) => i.id))).size, 14);
});
test("prioridades da demo reagem a edição, conclusão e pausa sem criar dados reais", () => {
  const data = buildConsultingDemoData(),
    state = buildConsultingDemo(),
    before = structuredClone({ data, state });
  const initial = consultingDemoDay(data, state, (k) => k, "delivery", 0);
  assert(initial.total > 0);
  const first = initial.items[0],
    delivery = state.deliveries.find((d) => d.id === first.id);
  const next = saveConsultingDemoDelivery(
    state,
    first.process_id,
    {
      title: "Entrega concluída",
      description: "",
      assignee_name: "",
      due_date: delivery.due_date,
      status: "aprovado",
      required: true,
    },
    delivery.id,
  );
  assert.equal(consultingDemoDay(data, next, (k) => k, "delivery", 0).total, initial.total - 1);
  assert(
    !consultingDemoDay(
      {
        ...data,
        cases: data.cases.map((p) =>
          p.id === first.process_id ? { ...p, status: "done", stage: 3 } : p,
        ),
      },
      state,
      (k) => k,
      "delivery",
      0,
    ).items.some((i) => i.process_id === first.process_id),
  );
  const follow = consultingDemoDay(data, state, (k) => k, "followup", 0);
  assert.equal(follow.total, 2);
  const plan = state.monthlyPlans.c1;
  const paused = saveConsultingDemoPlan(state, "c1", { ...plan, status: "pausado" }, plan.revision);
  assert.equal(consultingDemoDay(data, paused, (k) => k, "followup", 0).total, 1);
  const updated = {
    ...state,
    projectProfiles: {
      c1: { title: "Projeto atualizado", description: "", owner_name: "", due_date: "2027-12-01" },
    },
  };
  assert(
    !consultingDemoDay(data, updated, (k) => k, "project", 0).items.some(
      (i) => i.process_id === "c1",
    ),
  );
  assert.deepEqual({ data, state }, before);
});
test("ativação corresponde à migration; gravações relevantes invalidam o painel sem escrever ao consultar", () => {
  assert.equal(
    readFileSync("docs/operations/consulting-day-priorities.sql", "utf8"),
    readFileSync("supabase/migrations/20261020215124_consulting_day_priorities.sql", "utf8"),
  );
  const mutations = readFileSync("src/hooks/use-mutations.ts", "utf8");
  for (const name of [
    "useCreateProcess",
    "useMoveProcessStage",
    "useUpdateProcess",
    "useCreateChecklistItem",
    "useUpdateChecklistItem",
  ]) {
    const part = mutations.split(`export function ${name}`)[1].split("export function ")[0];
    assert.match(part, /\["consulting-day", organizationId\]/);
  }
  assert.match(
    readFileSync("src/hooks/use-consulting-plans.ts", "utf8"),
    /\["consulting-day", org\]/,
  );
  assert.doesNotMatch(
    readFileSync("src/components/consulting/consulting-day-card.tsx", "utf8"),
    /supabase|localStorage|fetch\(|useWorkspace/,
  );
});
