import type { DemoData } from "./public-demo";

// Dados exclusivamente fictícios. Sem banco, autenticação, armazenamento ou relógio externo.
export const LEGAL_DEMO_DATE = "2026-10-18";
export type LegalDemoState = {
  profiles: { caseId: string; owner: string | null; requirement: boolean }[];
  deadlines: {
    id: string;
    caseId: string;
    titleKey: string;
    date: string;
    status: "open" | "done" | "cancelled";
  }[];
  hearings: { id: string; caseId: string; at: string }[];
};
export type LegalDemoEvent = {
  id: string;
  kind: "general" | "individual" | "hearing" | "task";
  caseId?: string;
  titleKey: string;
  date: string;
  time?: string;
  owner?: string;
};
export function buildLegalDemo(): LegalDemoState {
  return {
    profiles: [
      { caseId: "c1", owner: "Ana R.", requirement: false },
      { caseId: "c2", owner: "Bruno M.", requirement: false },
      { caseId: "c3", owner: "Carla S.", requirement: true },
      { caseId: "c4", owner: null, requirement: false },
    ],
    deadlines: Array.from({ length: 20 }, (_, i) => ({
      id: `deadline-${i + 1}`,
      caseId: `c${Math.floor(i / 5) + 1}`,
      titleKey: `legalDemo.deadlineNames.d${(i % 5) + 1}`,
      date: ["2026-10-16", "2026-10-17", "2026-10-18"][i % 3],
      status: i === 0 ? "done" : i === 1 ? "cancelled" : "open",
    })),
    hearings: [
      { id: "hearing-1", caseId: "c1", at: "2026-10-18T09:00" },
      { id: "hearing-2", caseId: "c2", at: "2026-10-16T14:30" },
      { id: "hearing-3", caseId: "c3", at: "2026-10-18T11:00" },
    ],
  };
}
export function legalDemoEvents(data: DemoData, legal: LegalDemoState): LegalDemoEvent[] {
  const active = new Set(data.cases.filter((c) => c.status !== "done").map((c) => c.id));
  const events: LegalDemoEvent[] = [
    ...data.cases
      .filter((c) => active.has(c.id))
      .map((c) => ({
        id: `general:${c.id}`,
        kind: "general" as const,
        caseId: c.id,
        titleKey: c.titleKey,
        date: c.due,
      })),
    ...legal.deadlines
      .filter((d) => d.status === "open" && active.has(d.caseId))
      .map((d) => ({
        id: d.id,
        kind: "individual" as const,
        caseId: d.caseId,
        titleKey: d.titleKey,
        date: d.date,
      })),
    ...legal.hearings
      .filter((h) => active.has(h.caseId))
      .map((h) => ({
        id: h.id,
        kind: "hearing" as const,
        caseId: h.caseId,
        titleKey: "legalDemo.hearing",
        date: h.at.slice(0, 10),
        time: h.at.slice(11, 16),
      })),
    ...data.tasks
      .filter((t) => !t.done)
      .map((t) => ({
        id: t.id,
        kind: "task" as const,
        titleKey: t.titleKey,
        date: t.due,
        time: "10:00",
        owner: t.owner,
      })),
  ];
  return events.sort((a, b) =>
    `${a.date}T${a.time ?? "00:00"}:${a.id}`.localeCompare(
      `${b.date}T${b.time ?? "00:00"}:${b.id}`,
    ),
  );
}
export function summarizeLegalDemo(data: DemoData, legal: LegalDemoState) {
  const deadlines = legalDemoEvents(data, legal).filter(
    (e) => e.kind === "general" || e.kind === "individual",
  );
  return {
    active: data.cases.filter((c) => c.status !== "done").length,
    requirement: data.cases.filter(
      (c) => c.status !== "done" && legal.profiles.some((p) => p.caseId === c.id && p.requirement),
    ).length,
    withoutOwner: data.cases.filter(
      (c) => c.status !== "done" && !legal.profiles.find((p) => p.caseId === c.id)?.owner,
    ).length,
    overdue: deadlines.filter((e) => e.date < LEGAL_DEMO_DATE).length,
    today: deadlines.filter((e) => e.date === LEGAL_DEMO_DATE).length,
    nextSeven: deadlines.filter((e) => e.date > LEGAL_DEMO_DATE && e.date <= "2026-10-25").length,
    urgent: deadlines.filter((e) => e.date <= "2026-10-25"),
  };
}
export function legalDemoAgenda(
  data: DemoData,
  legal: LegalDemoState,
  start: string,
  end: string,
  page: number,
) {
  const events = legalDemoEvents(data, legal).filter((e) => e.date >= start && e.date < end);
  const pages = Math.max(1, Math.ceil(events.length / 20));
  const current = Math.max(1, Math.min(pages, Number.isInteger(page) ? page : 1));
  return {
    total: events.length,
    pages,
    page: current,
    items: events.slice((current - 1) * 20, current * 20),
    hearings: events.filter((e) => e.kind === "hearing").length,
    deadlines: events.filter((e) => e.kind === "general" || e.kind === "individual").length,
    tasks: events.filter((e) => e.kind === "task").length,
  };
}
export function updateLegalDemoHearing(
  state: LegalDemoState,
  id: string,
  at: string,
): LegalDemoState {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ||
    at.slice(11, 16) > "23:59" ||
    Number(at.slice(14, 16)) > 59
  )
    return state;
  const parsed = new Date(`${at.slice(0, 10)}T12:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== at.slice(0, 10) ||
    at.slice(0, 10) < "2000-01-01" ||
    at.slice(0, 10) > "2100-12-31"
  )
    return state;
  return { ...state, hearings: state.hearings.map((h) => (h.id === id ? { ...h, at } : h)) };
}
export function toggleLegalDemoDeadline(state: LegalDemoState, id: string): LegalDemoState {
  return {
    ...state,
    deadlines: state.deadlines.map((d) =>
      d.id === id && d.status !== "cancelled"
        ? { ...d, status: d.status === "open" ? "done" : "open" }
        : d,
    ),
  };
}
