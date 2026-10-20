import {
  normalizedMonthlyPlan,
  monthlyDueDate,
  monthInPlan,
  type MonthlyPlan,
  type MonthlyPlanValues,
} from "./consulting-plans.ts";
import {
  consultingDeliveryPayload,
  consultingProjectPayload,
  type ConsultingProjectValues,
  type ConsultingDeliveryValues,
} from "./consulting-project.ts";
import { buildDemoData, type DemoData } from "./public-demo.ts";
export const CONSULTING_DEMO_DATE = "2026-10-18";
export type ConsultingDemoState = {
  monthlyPlans: Record<string, MonthlyPlan & { example?: boolean }>;
  monthlyGenerated: Record<string, string[]>;
  projectProfiles: Record<string, ConsultingProjectValues>;
  requests: {
    id: string;
    recordId: string;
    serviceKey: string;
    status: "new" | "proposal" | "project";
  }[];
  proposals: {
    id: string;
    requestId: string;
    recordId: string;
    serviceKey: string;
    amount: number;
    due: string;
    status: "draft" | "sent" | "accepted";
    projectId?: string;
  }[];
  deliveries: {
    id: string;
    projectId: string;
    titleKey: string;
    done: boolean;
    title?: string;
    description?: string;
    assignee_name?: string;
    due_date?: string;
    status?: ConsultingDeliveryValues["status"];
    required?: boolean;
  }[];
};
export function buildConsultingDemoData(): DemoData {
  const data = buildDemoData("consulting_services");
  return {
    ...data,
    cases: data.cases.map((c) => ({ ...c, status: c.stage === 3 ? "done" : "active" })),
    schedule: [
      { id: "s1", date: "2026-10-20T09:00:00", typeKey: "consultingDemo.meeting", recordId: "r1" },
      { id: "s2", date: "2026-10-22T14:00:00", typeKey: "consultingDemo.meeting", recordId: "r3" },
    ],
  };
}
export function buildConsultingDemo(): ConsultingDemoState {
  return {
    projectProfiles: {},
    monthlyGenerated: {},
    monthlyPlans: Object.fromEntries(
      ["c1", "c2"].map((id, index) => [
        id,
        {
          process_id: id,
          organization_id: "demo",
          service_name: index
            ? "consultingPlans.exampleService2"
            : "consultingPlans.exampleService",
          monthly_amount: index ? 800 : 1500,
          starts_on: "2026-10-01",
          ends_on: index ? "2026-10-31" : "2026-12-31",
          return_on: index ? "2026-10-22" : "2026-10-17",
          status: "ativo" as const,
          revision: 1,
          example: true,
          routine: [
            {
              title: index ? "consultingPlans.activity3" : "consultingPlans.activity1",
              day: index ? 10 : 5,
            },
            {
              title: index ? "consultingPlans.activity4" : "consultingPlans.activity2",
              day: index ? 20 : 25,
            },
          ],
        },
      ]),
    ),
    requests: [
      { id: "q1", recordId: "r1", serviceKey: "consultingDemo.services.s1", status: "new" },
      { id: "q2", recordId: "r3", serviceKey: "consultingDemo.services.s2", status: "proposal" },
      { id: "q3", recordId: "r2", serviceKey: "consultingDemo.services.s3", status: "proposal" },
    ],
    proposals: [
      {
        id: "p2",
        requestId: "q2",
        recordId: "r3",
        serviceKey: "consultingDemo.services.s2",
        amount: 800,
        due: "2026-11-04",
        status: "sent",
      },
      {
        id: "p3",
        requestId: "q3",
        recordId: "r2",
        serviceKey: "consultingDemo.services.s3",
        amount: 3200,
        due: "2026-11-12",
        status: "accepted",
      },
    ],
    deliveries: Array.from({ length: 12 }, (_, i) => ({
      id: `delivery-${i + 1}`,
      projectId: `c${Math.floor(i / 3) + 1}`,
      titleKey: `consultingDemo.deliveries.d${(i % 3) + 1}`,
      done: Math.floor(i / 3) === 2 || i % 3 < [1, 2, 3, 0][Math.floor(i / 3)],
    })),
  };
}
export function createConsultingDemoProposal(
  state: ConsultingDemoState,
  requestId: string,
): ConsultingDemoState {
  const request = state.requests.find((r) => r.id === requestId);
  if (!request || state.proposals.some((p) => p.requestId === requestId)) return state;
  return {
    ...state,
    requests: state.requests.map((r) => (r.id === requestId ? { ...r, status: "proposal" } : r)),
    proposals: [
      ...state.proposals,
      {
        id: `proposal-${requestId}`,
        requestId,
        recordId: request.recordId,
        serviceKey: request.serviceKey,
        amount: 2500,
        due: "2026-11-05",
        status: "draft",
      },
    ],
  };
}
export function advanceConsultingDemoProposal(
  state: ConsultingDemoState,
  id: string,
): ConsultingDemoState {
  return {
    ...state,
    proposals: state.proposals.map((p) =>
      p.id === id && p.status !== "accepted"
        ? { ...p, status: p.status === "draft" ? "sent" : "accepted" }
        : p,
    ),
  };
}
export function startConsultingDemoProject(data: DemoData, state: ConsultingDemoState, id: string) {
  const proposal = state.proposals.find((p) => p.id === id);
  if (
    !proposal ||
    proposal.status !== "accepted" ||
    proposal.projectId ||
    !data.records.some((r) => r.id === proposal.recordId)
  )
    return { data, state };
  const projectId = `project-${id}`;
  if (data.cases.some((c) => c.id === projectId)) return { data, state };
  return {
    data: {
      ...data,
      cases: [
        ...data.cases,
        {
          id: projectId,
          code: `PRJ-DEMO-${state.proposals.findIndex((p) => p.id === id) + 1}`,
          titleKey: proposal.serviceKey,
          recordId: proposal.recordId,
          status: "active" as const,
          stage: 0,
          due: proposal.due,
          amount: proposal.amount,
        },
      ],
    },
    state: {
      ...state,
      proposals: state.proposals.map((p) => (p.id === id ? { ...p, projectId } : p)),
      requests: state.requests.map((r) =>
        r.id === proposal.requestId ? { ...r, status: "project" as const } : r,
      ),
      deliveries: [
        ...state.deliveries,
        ...[1, 2, 3].map((n) => ({
          id: `${projectId}-d${n}`,
          projectId,
          titleKey: `consultingDemo.deliveries.d${n}`,
          done: false,
        })),
      ],
    },
  };
}
export function toggleConsultingDelivery(
  state: ConsultingDemoState,
  id: string,
): ConsultingDemoState {
  return {
    ...state,
    deliveries: state.deliveries.map((d) =>
      d.id === id
        ? { ...d, done: !d.done, status: !d.done ? ("aprovado" as const) : ("pendente" as const) }
        : d,
    ),
  };
}
export function advanceConsultingDemoProject(
  data: DemoData,
  state: ConsultingDemoState,
  id: string,
): DemoData {
  const project = data.cases.find((c) => c.id === id);
  if (
    !project ||
    project.status === "done" ||
    (project.stage >= 2 && state.deliveries.some((d) => d.projectId === id && !d.done))
  )
    return data;
  return {
    ...data,
    cases: data.cases.map((c) =>
      c.id === id
        ? { ...c, stage: Math.min(c.stage + 1, 3), status: c.stage >= 2 ? "done" : "active" }
        : c,
    ),
  };
}
export function consultingDemoSummary(data: DemoData, state: ConsultingDemoState) {
  return {
    requests: state.requests.filter((r) => r.status !== "project").length,
    proposals: state.proposals.filter((p) => p.status !== "accepted").length,
    projects: data.cases.filter((c) => c.status !== "done").length,
    deliveries: state.deliveries.filter(
      (d) => !d.done && data.cases.some((c) => c.id === d.projectId && c.status !== "done"),
    ).length,
  };
}

/** Simulação da mesma ficha; texto digitado é preservado como texto, nunca chave de tradução. */
export function saveConsultingDemoProfile(
  data: DemoData,
  state: ConsultingDemoState,
  id: string,
  values: ConsultingProjectValues,
) {
  consultingProjectPayload(values);
  if (!data.cases.some((p) => p.id === id)) throw new Error("PROJECT_NOT_FOUND");
  return {
    data: {
      ...data,
      cases: data.cases.map((p) => (p.id === id ? { ...p, due: values.due_date } : p)),
    },
    state: {
      ...state,
      projectProfiles: {
        ...state.projectProfiles,
        [id]: {
          ...values,
          title: values.title.trim(),
          description: values.description.trim(),
          owner_name: values.owner_name.trim(),
        },
      },
    },
  };
}
export function saveConsultingDemoDelivery(
  state: ConsultingDemoState,
  projectId: string,
  values: ConsultingDeliveryValues,
  id?: string,
): ConsultingDemoState {
  consultingDeliveryPayload(values);
  if (id && !state.deliveries.some((d) => d.id === id && d.projectId === projectId))
    throw new Error("DELIVERY_NOT_FOUND");
  const patch = {
    ...values,
    title: values.title.trim(),
    description: values.description.trim(),
    assignee_name: values.assignee_name.trim(),
    done: values.status === "aprovado",
  };
  return {
    ...state,
    deliveries: id
      ? state.deliveries.map((d) => (d.id === id ? { ...d, ...patch } : d))
      : [
          ...state.deliveries,
          {
            ...patch,
            id: `custom-${projectId}-${state.deliveries.length + 1}`,
            projectId,
            titleKey: "",
          },
        ],
  };
}

export function saveConsultingDemoPlan(
  state: ConsultingDemoState,
  id: string,
  values: MonthlyPlanValues,
  revision: number | null,
): ConsultingDemoState {
  const previous = state.monthlyPlans[id];
  if ((previous?.revision ?? null) !== revision) throw new Error("CONSULTING_PLAN_STALE");
  return {
    ...state,
    monthlyPlans: {
      ...state.monthlyPlans,
      [id]: {
        ...normalizedMonthlyPlan(values),
        process_id: id,
        organization_id: "demo",
        revision: (previous?.revision ?? 0) + 1,
      },
    },
  };
}
export function generateConsultingDemoMonth(
  data: DemoData,
  state: ConsultingDemoState,
  id: string,
  reference: string,
) {
  const plan = state.monthlyPlans[id],
    project = data.cases.find((p) => p.id === id),
    key = `${id}:${reference}`;
  if (!project || project.status === "done") throw new Error("CONSULTING_PLAN_PROJECT_NOT_FOUND");
  if (!plan || plan.status !== "ativo") throw new Error("CONSULTING_PLAN_NOT_ACTIVE");
  if (!monthInPlan(reference, plan)) throw new Error("CONSULTING_PLAN_MONTH_OUTSIDE_PERIOD");
  if (state.monthlyGenerated[key])
    return { data, state, created: 0, existing: state.monthlyGenerated[key].length };
  const tasks = plan.routine.map((activity, index) => ({
    id: `monthly-${key}-${index}`,
    titleKey: plan.example ? activity.title : "",
    ...(plan.example ? {} : { title: activity.title }),
    due: monthlyDueDate(reference, activity.day, plan),
    priority: "medium" as const,
    done: false,
    owner: "Equipe FLUXA (fictícia)",
  }));
  return {
    data: { ...data, tasks: [...data.tasks, ...tasks] },
    state: {
      ...state,
      monthlyGenerated: { ...state.monthlyGenerated, [key]: tasks.map((task) => task.id) },
    },
    created: tasks.length,
    existing: 0,
  };
}
