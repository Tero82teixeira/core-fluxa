import { ConsultingMonthlyPlanCard } from "./consulting-monthly-plan-card";
import { ConsultingPlansList } from "./consulting-plans-list";
import type { PlanOverview, MonthlyPlan } from "@/lib/consulting-plans";
import { useState } from "react";
import { ConsultingProjectCard } from "./consulting-project-card";
import { ConsultingDeliveriesCard } from "./consulting-deliveries-card";
import "@/i18n";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LOCALE_BY_LANGUAGE, type AppLanguage } from "@/i18n";
import {
  CONSULTING_DEMO_DATE,
  saveConsultingDemoPlan,
  generateConsultingDemoMonth,
  saveConsultingDemoProfile,
  saveConsultingDemoDelivery,
  buildConsultingDemo,
  buildConsultingDemoData,
  createConsultingDemoProposal,
  advanceConsultingDemoProposal,
  startConsultingDemoProject,
  toggleConsultingDelivery,
  advanceConsultingDemoProject,
  consultingDemoSummary,
  type ConsultingDemoState,
} from "@/lib/consulting-demo";
import type { DemoData, DemoModule } from "@/lib/public-demo";

export function ConsultingPublicDemo({
  module,
  data,
  setData,
  consulting,
  setConsulting,
  goTo,
}: {
  module: DemoModule;
  data: DemoData;
  setData: (fn: (d: DemoData) => DemoData) => void;
  consulting: ConsultingDemoState;
  setConsulting: (fn: (s: ConsultingDemoState) => ConsultingDemoState) => void;
  goTo: (module: DemoModule) => void;
}) {
  const { t, i18n } = useTranslation();
  const [planMonth, setPlanMonth] = useState("2026-10");
  const [planPage, setPlanPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const locale = LOCALE_BY_LANGUAGE[(i18n.resolvedLanguage ?? "pt") as AppLanguage];
  const date = (value: string) =>
    value
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          new Date(`${value.slice(0, 10)}T12:00:00`),
        )
      : t("consultingProject.empty");
  const money = (value: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
  const client = (id: string) => data.records.find((r) => r.id === id)?.name ?? "—";
  const summary = consultingDemoSummary(data, consulting);
  const displayPlan = (plan: MonthlyPlan & { example?: boolean }) =>
    plan.example
      ? {
          ...plan,
          service_name: t(plan.service_name),
          routine: plan.routine.map((item) => ({ ...item, title: t(item.title) })),
        }
      : plan;
  const plans = Object.values(consulting.monthlyPlans).map((plan) => ({
    ...displayPlan(plan),
    code: data.cases.find((p) => p.id === plan.process_id)?.code ?? "",
    client_id: data.cases.find((p) => p.id === plan.process_id)?.recordId ?? "",
    client_name: client(data.cases.find((p) => p.id === plan.process_id)?.recordId ?? ""),
  }));
  const plansOverview: PlanOverview = {
    items: plans.slice(planPage * 10, (planPage + 1) * 10),
    total: plans.length,
    ending: plans.filter(
      (p) => p.status === "ativo" && p.ends_on >= CONSULTING_DEMO_DATE && p.ends_on <= "2026-11-17",
    ).length,
    expired: plans.filter((p) => p.status === "ativo" && p.ends_on < CONSULTING_DEMO_DATE).length,
    returns: plans.filter(
      (p) => p.status === "ativo" && p.return_on && p.return_on <= CONSULTING_DEMO_DATE,
    ).length,
    today: CONSULTING_DEMO_DATE,
  };
  const openProject = (id: string) => {
    const next = startConsultingDemoProject(data, consulting, id);
    setData(() => next.data);
    setConsulting(() => next.state);
    goTo("cases");
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("consultingDemo.notice", { date: date(CONSULTING_DEMO_DATE) })}
        </p>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setSelected(null);
            setPlanMonth("2026-10");
            setPlanPage(0);
            setData(buildConsultingDemoData);
            setConsulting(buildConsultingDemo);
          }}
        >
          {t("consultingDemo.reset")}
        </Button>
      </div>
      {module === "overview" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(["requests", "proposals", "projects", "deliveries"] as const).map((key, i) => (
              <button
                key={key}
                className="min-h-24 rounded-xl border bg-card p-4 text-left hover:bg-muted"
                onClick={() =>
                  goTo((["attendance", "proposals", "cases", "cases"] as DemoModule[])[i])
                }
              >
                <span className="text-sm text-muted-foreground">
                  {t(`consultingDemo.metrics.${key}`)}
                </span>
                <strong className="mt-2 block text-3xl">{summary[key]}</strong>
              </button>
            ))}
          </div>
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("consultingDemo.journey")}</h2>
            <p className="text-sm text-muted-foreground">{t("consultingDemo.intro")}</p>
            <div className="flex flex-wrap gap-2">
              {(["records", "attendance", "proposals", "cases", "plans"] as const).map((key) => (
                <Button key={key} variant="outline" className="min-h-11" onClick={() => goTo(key)}>
                  {t(`demo.modules.consulting_services.${key}`)}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{t("consultingDemo.realFlow")}</p>
          </section>
        </>
      )}
      {module === "attendance" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {consulting.requests.map((request) => (
            <article key={request.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-5">
              <p className="break-words text-sm text-muted-foreground">
                {client(request.recordId)}
              </p>
              <h2 className="font-semibold">{t(request.serviceKey)}</h2>
              <p className="text-sm">{t(`consultingDemo.requestStatus.${request.status}`)}</p>
              <Button
                className="min-h-11"
                variant="outline"
                onClick={() => {
                  if (request.status === "new")
                    setConsulting((s) => createConsultingDemoProposal(s, request.id));
                  goTo(request.status === "project" ? "cases" : "proposals");
                }}
              >
                {t(
                  request.status === "new"
                    ? "consultingDemo.prepare"
                    : request.status === "project"
                      ? "consultingDemo.viewProjects"
                      : "consultingDemo.viewProposals",
                )}
              </Button>
            </article>
          ))}
        </div>
      )}
      {module === "proposals" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {consulting.proposals.map((proposal) => (
            <article key={proposal.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-5">
              <p className="break-words text-sm text-muted-foreground">
                {client(proposal.recordId)}
              </p>
              <h2 className="font-semibold">{t(proposal.serviceKey)}</h2>
              <p className="text-sm text-muted-foreground">{t("consultingDemo.scope")}</p>
              <p className="font-semibold">{money(proposal.amount)}</p>
              <p className="text-sm">
                {t("consultingDemo.due")}: {date(proposal.due)}
              </p>
              <p className="text-sm font-medium text-primary">
                {t(`consultingDemo.proposalStatus.${proposal.status}`)}
              </p>
              {proposal.projectId ? (
                <Button variant="outline" className="min-h-11" onClick={() => goTo("cases")}>
                  {t("consultingDemo.viewProjects")}
                </Button>
              ) : (
                <Button
                  className="min-h-11"
                  onClick={() =>
                    proposal.status === "accepted"
                      ? openProject(proposal.id)
                      : setConsulting((s) => advanceConsultingDemoProposal(s, proposal.id))
                  }
                >
                  {t(
                    proposal.status === "draft"
                      ? "consultingDemo.send"
                      : proposal.status === "sent"
                        ? "consultingDemo.accept"
                        : "consultingDemo.start",
                  )}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {module === "plans" && (
        <ConsultingPlansList
          data={plansOverview}
          page={planPage}
          onPage={setPlanPage}
          formatDate={date}
          onOpen={(id) => {
            setSelected(id);
            goTo("cases");
          }}
        />
      )}
      {module === "cases" && (
        <div className={selected ? "grid gap-4" : "grid gap-4 xl:grid-cols-2"}>
          {data.cases
            .filter((project) => !selected || project.id === selected)
            .map((project) => {
              const deliveries = consulting.deliveries.filter((d) => d.projectId === project.id);
              const blocked = project.stage >= 2 && deliveries.some((d) => !d.done);
              return (
                <article
                  key={project.id}
                  className="min-w-0 space-y-3 rounded-xl border bg-card p-5"
                >
                  <p className="text-xs text-primary">{project.code}</p>
                  <h2 className="break-words font-semibold">
                    {consulting.projectProfiles[project.id]?.title ?? t(project.titleKey)}
                  </h2>
                  <p className="break-words text-sm text-muted-foreground">
                    {client(project.recordId)}
                  </p>
                  <p className="text-sm">
                    {money(project.amount)} · {date(project.due)}
                  </p>
                  <p className="font-medium">{t(`consultingDemo.stages.s${project.stage}`)}</p>
                  <Button
                    className="min-h-11"
                    variant="outline"
                    onClick={() => setSelected(selected ? null : project.id)}
                  >
                    {t(selected ? "consultingProject.back" : "consultingProject.open")}
                  </Button>
                  {selected === project.id && (
                    <div className="space-y-4">
                      <ConsultingProjectCard
                        key={project.id}
                        canEdit
                        values={
                          consulting.projectProfiles[project.id] ?? {
                            title: t(project.titleKey),
                            description: t("consultingDemo.scope"),
                            owner_name: t("consultingProject.exampleOwner"),
                            due_date: project.due,
                          }
                        }
                        formatDate={date}
                        onSave={async (values) => {
                          const next = saveConsultingDemoProfile(
                            data,
                            consulting,
                            project.id,
                            values,
                          );
                          setData(() => next.data);
                          setConsulting(() => next.state);
                        }}
                      />
                      <ConsultingMonthlyPlanCard
                        workspace={{
                          plan: consulting.monthlyPlans[project.id]
                            ? displayPlan(consulting.monthlyPlans[project.id])
                            : null,
                          generated: Boolean(
                            consulting.monthlyGenerated[`${project.id}:${planMonth}`],
                          ),
                          tasks: (
                            consulting.monthlyGenerated[`${project.id}:${planMonth}`] ?? []
                          ).flatMap((id) => {
                            const task = data.tasks.find((task) => task.id === id);
                            return task
                              ? [
                                  {
                                    id: task.id,
                                    title: task.title ?? t(task.titleKey),
                                    due_date: task.due,
                                    status: task.done ? "concluida" : "pendente",
                                    deleted: false,
                                  },
                                ]
                              : [];
                          }),
                        }}
                        canEdit
                        canGenerate={project.status !== "done"}
                        month={planMonth}
                        onMonth={(value) => {
                          if (/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value)) setPlanMonth(value);
                        }}
                        today={CONSULTING_DEMO_DATE}
                        initialTitle={
                          consulting.projectProfiles[project.id]?.title ?? t(project.titleKey)
                        }
                        formatDate={date}
                        money={money}
                        onSave={async (values, revision) => {
                          const next=saveConsultingDemoPlan(consulting,project.id,values,revision);
                          setConsulting(()=>next);
                        }}
                        onGenerate={async () => {
                          const next = generateConsultingDemoMonth(
                            data,
                            consulting,
                            project.id,
                            planMonth,
                          );
                          setData(() => next.data);
                          setConsulting(() => next.state);
                          return { created: next.created, existing: next.existing };
                        }}
                      />
                      <ConsultingDeliveriesCard
                        items={deliveries.map((d) => ({
                          id: d.id,
                          title: d.title ?? t(d.titleKey),
                          description: d.description ?? "",
                          assignee_name: d.assignee_name ?? "",
                          due_date: d.due_date ?? "",
                          status: d.status ?? (d.done ? "aprovado" : "pendente"),
                          required: d.required ?? true,
                        }))}
                        today={CONSULTING_DEMO_DATE}
                        canEdit={project.status !== "done"}
                        formatDate={date}
                        onSave={async (values, id) =>
                          setConsulting((state) =>
                            saveConsultingDemoDelivery(state, project.id, values, id),
                          )
                        }
                      />
                    </div>
                  )}
                  <div>
                    {deliveries.map((delivery) => (
                      <label
                        key={delivery.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="size-5 shrink-0"
                          checked={delivery.done}
                          disabled={project.status === "done"}
                          onChange={() =>
                            setConsulting((s) => toggleConsultingDelivery(s, delivery.id))
                          }
                        />
                        {delivery.title ?? t(delivery.titleKey)}
                      </label>
                    ))}
                  </div>
                  {project.status !== "done" && (
                    <>
                      <Button
                        className="min-h-11"
                        disabled={blocked}
                        onClick={() =>
                          setData((d) => advanceConsultingDemoProject(d, consulting, project.id))
                        }
                      >
                        {t(project.stage >= 2 ? "consultingDemo.finish" : "consultingDemo.advance")}
                      </Button>
                      {blocked && (
                        <p className="text-sm text-muted-foreground">
                          {t("consultingDemo.pending")}
                        </p>
                      )}
                    </>
                  )}
                </article>
              );
            })}
        </div>
      )}
      {module === "schedule" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.schedule.map((event) => (
            <article key={event.id} className="space-y-2 rounded-xl border bg-card p-5">
              <h2 className="font-semibold">{t(event.typeKey)}</h2>
              <p>{client(event.recordId)}</p>
              <p className="text-sm text-muted-foreground">
                {date(event.date)} · {event.date.slice(11, 16)}
              </p>
            </article>
          ))}
          {data.cases
            .filter((p) => p.status !== "done")
            .map((project) => (
              <article key={project.id} className="space-y-2 rounded-xl border bg-card p-5">
                <h2 className="font-semibold">
                  {consulting.projectProfiles[project.id]?.title ?? t(project.titleKey)}
                </h2>
                <p className="text-sm">
                  {t("consultingDemo.due")}: {date(project.due)}
                </p>
                <Button variant="outline" className="min-h-11" onClick={() => goTo("cases")}>
                  {t("consultingDemo.viewProjects")}
                </Button>
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
