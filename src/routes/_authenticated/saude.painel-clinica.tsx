import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  Timer,
  Users,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type HealthAppointment, useHealthAppointments } from "@/hooks/use-health-appointments";
import { useHealthBillingItems } from "@/hooks/use-health-billing";
import { useHealthDenials } from "@/hooks/use-health-denials";
import { useHealthAuthorizations } from "@/hooks/use-health-insurance";
import { localCivilDate, summarizeClinicDashboard } from "@/lib/health-clinic-dashboard";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/saude/painel-clinica")({
  head: () => ({
    meta: [
      { title: "Painel da Clínica — FLUXA Saúde" },
      {
        name: "description",
        content: "Agenda, pendências administrativas e faturamento da operação de saúde.",
      },
    ],
  }),
  component: HealthClinicDashboardPage,
});

const BILLING_ROLES = new Set(["superadmin", "proprietario", "administrador", "gestor"]);

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function time(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function civilDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function waitingTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}min` : ""}`;
}

function HealthClinicDashboardPage() {
  const { organizationId, role } = useWorkspace();
  const today = localCivilDate();
  const canViewBilling = BILLING_ROLES.has(role ?? "");
  const appointments = useHealthAppointments(organizationId, today);
  const authorizations = useHealthAuthorizations(organizationId, "");
  const billing = useHealthBillingItems(organizationId, "", canViewBilling);
  const denials = useHealthDenials(organizationId, "", canViewBilling);

  const summary = useMemo(
    () =>
      summarizeClinicDashboard({
        appointments: appointments.data ?? [],
        authorizations: authorizations.data ?? [],
        billingItems: billing.data ?? [],
        denials: denials.data ?? [],
        today,
      }),
    [appointments.data, authorizations.data, billing.data, denials.data, today],
  );

  const nextAppointments = useMemo(
    () =>
      [...(appointments.data ?? [])]
        .filter((item) => !["cancelado", "faltou"].includes(item.status))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .slice(0, 6),
    [appointments.data],
  );

  const receptionQueue = useMemo(
    () =>
      [...(appointments.data ?? [])]
        .filter(
          (item) =>
            ["agendado", "confirmado"].includes(item.status) &&
            ["chegou", "em_atendimento"].includes(item.reception_status),
        )
        .sort((a, b) =>
          String(a.checked_in_at ?? a.starts_at).localeCompare(
            String(b.checked_in_at ?? b.starts_at),
          ),
        ),
    [appointments.data],
  );

  const isLoading =
    appointments.isLoading ||
    authorizations.isLoading ||
    (canViewBilling && (billing.isLoading || denials.isLoading));
  const hasError =
    appointments.isError ||
    authorizations.isError ||
    (canViewBilling && (billing.isError || denials.isError));

  const refresh = () => {
    void appointments.refetch();
    void authorizations.refetch();
    if (canViewBilling) {
      void billing.refetch();
      void denials.refetch();
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-900 p-5 text-white shadow-xl shadow-emerald-950/10 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-400/20">
                <Activity className="size-6" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-emerald-300 uppercase">
                  FLUXA Saúde
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Painel da Clínica
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200">
              O resumo administrativo do dia: horários, confirmações, autorizações e faturamento,
              sem prontuário, diagnóstico, prescrição ou evolução clínica.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to="/saude/agenda" search={{ date: undefined }}>
                Abrir Agenda
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              onClick={refresh}
            >
              <RefreshCw className="size-4" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando o painel da clínica…
          </CardContent>
        </Card>
      ) : hasError ? (
        <Card className="border-destructive/30">
          <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="size-7 text-destructive" />
            <div>
              <p className="font-medium">Não foi possível carregar todo o painel.</p>
              <p className="text-sm text-muted-foreground">Tente atualizar os indicadores.</p>
            </div>
            <Button type="button" variant="outline" onClick={refresh}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section
            aria-label="Resumo da agenda"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          >
            <MetricCard
              label="Atendimentos hoje"
              value={summary.appointmentCounts.total}
              icon={Users}
              tone="blue"
            />
            <MetricCard
              label="A confirmar"
              value={summary.appointmentCounts.awaitingConfirmation}
              icon={Clock3}
              tone="amber"
            />
            <MetricCard
              label="Confirmados"
              value={summary.appointmentCounts.confirmed}
              icon={CalendarCheck}
              tone="emerald"
            />
            <MetricCard
              label="Na recepção"
              value={summary.appointmentCounts.waiting}
              icon={Timer}
              tone="amber"
            />
            <MetricCard
              label="Em atendimento"
              value={summary.appointmentCounts.inService}
              icon={Play}
              tone="blue"
            />
            <MetricCard
              label="Concluídos"
              value={summary.appointmentCounts.completed}
              icon={CheckCircle2}
              tone="violet"
            />
          </section>

          <Card
            className={receptionQueue.length > 0 ? "border-amber-500/30 bg-amber-500/[0.03]" : ""}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Timer className="size-4 text-amber-600" />
                  Fila da recepção
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Chegadas registradas e atendimentos em andamento.
                </p>
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link to="/saude/agenda" search={{ date: today }}>
                  Abrir recepção <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {receptionQueue.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3">
                  <EmptyState icon={CheckCircle2} text="Nenhum paciente aguardando na recepção." />
                </div>
              ) : (
                receptionQueue.map((appointment) => (
                  <div key={appointment.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{appointment.patient_name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {appointment.service_label} · {time(appointment.starts_at)}
                        </p>
                      </div>
                      <Badge variant="outline">{appointmentStatus(appointment)}</Badge>
                    </div>
                    {appointment.reception_status === "chegou" && appointment.checked_in_at && (
                      <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                        Aguardando há {waitingTime(appointment.checked_in_at)}
                      </p>
                    )}
                    {appointment.reception_status === "em_atendimento" &&
                      appointment.service_started_at && (
                        <p className="mt-3 text-xs font-medium text-blue-700 dark:text-blue-300">
                          Iniciado às {time(appointment.service_started_at)}
                        </p>
                      )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Agenda de hoje</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Próximos atendimentos e situação atual.
                  </p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/saude/agenda" search={{ date: undefined }}>
                    Ver agenda <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {nextAppointments.length === 0 ? (
                  <EmptyState
                    icon={CalendarClock}
                    text="Nenhum atendimento programado para hoje."
                  />
                ) : (
                  nextAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="flex flex-col gap-2 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{appointment.patient_name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {time(appointment.starts_at)}–{time(appointment.ends_at)} ·{" "}
                          {appointment.service_label}
                        </p>
                      </div>
                      <Badge variant="outline">{appointmentStatus(appointment)}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardCheck className="size-4 text-indigo-500" />
                    Autorizações próximas do vencimento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {summary.expiringAuthorizations.length === 0 ? (
                    <EmptyState
                      icon={CheckCircle2}
                      text="Nenhuma autorização vence nos próximos 7 dias."
                    />
                  ) : (
                    summary.expiringAuthorizations.slice(0, 5).map((authorization) => (
                      <div key={authorization.id} className="rounded-xl border p-3">
                        <p className="font-medium">{authorization.patient_name || "Paciente"}</p>
                        <p className="text-sm text-muted-foreground">
                          {authorization.service_label} · vence em{" "}
                          {civilDate(authorization.valid_until)}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {canViewBilling && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <WalletCards className="size-4 text-violet-500" />
                      Faturamento administrativo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <FinancialMetric label="Em aberto" value={money(summary.openBillingAmount)} />
                    <FinancialMetric label="Rascunhos" value={String(summary.draftBillingCount)} />
                    <Button
                      asChild
                      variant="outline"
                      className="sm:col-span-2 xl:col-span-1 2xl:col-span-2"
                    >
                      <Link to="/saude/contas-medicas">Abrir Contas Médicas</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {canViewBilling && (
            <Card
              className={
                summary.urgentDenials.length > 0 ? "border-rose-500/30 bg-rose-500/[0.03]" : ""
              }
            >
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleDollarSign className="size-4 text-rose-500" />
                  Glosas com prazo de recurso próximo
                </CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/saude/glosas">Ver glosas</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.urgentDenials.length === 0 ? (
                  <EmptyState icon={CheckCircle2} text="Nenhuma glosa vence nos próximos 7 dias." />
                ) : (
                  summary.urgentDenials.slice(0, 6).map((denial) => (
                    <div
                      key={denial.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="font-medium">
                          {denial.patient_name || denial.service_label || "Glosa"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Recurso até {civilDate(denial.appeal_due_date)} · {denial.reason}
                        </p>
                      </div>
                      <p className="font-semibold text-rose-600">
                        {money(Number(denial.denied_amount || 0))}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function appointmentStatus(appointment: HealthAppointment) {
  if (
    appointment.status === "concluido" ||
    appointment.status === "faltou" ||
    appointment.status === "cancelado"
  ) {
    return (
      {
        concluido: "Concluído",
        faltou: "Faltou",
        cancelado: "Cancelado",
      }[appointment.status] ?? appointment.status
    );
  }
  if (appointment.reception_status === "chegou") return "Na recepção";
  if (appointment.reception_status === "em_atendimento") return "Em atendimento";
  return (
    {
      agendado: "A confirmar",
      confirmado: "Confirmado",
      concluido: "Concluído",
    }[appointment.status] ?? appointment.status
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: "blue" | "amber" | "emerald" | "violet";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-600",
    amber: "bg-amber-500/10 text-amber-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
    violet: "bg-violet-500/10 text-violet-600",
  };
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className={`grid size-11 place-items-center rounded-2xl ${tones[tone]}`}>
          <Icon className="size-5" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

function FinancialMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Activity; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
      <Icon className="size-5 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
