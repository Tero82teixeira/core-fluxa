import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogIn,
  Loader2,
  MapPin,
  Play,
  Plus,
  ReceiptText,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHealthPatients } from "@/hooks/use-health-patients";
import {
  type HealthAppointment,
  type HealthAppointmentStatus,
  useCompleteHealthAppointmentAndCreateBilling,
  useCreateHealthAppointment,
  useHealthAppointmentProfessionals,
  useHealthAppointments,
  useHealthAppointmentsRange,
  useRescheduleHealthAppointment,
  useUpdateHealthAppointmentReceptionStatus,
  useUpdateHealthAppointmentStatus,
} from "@/hooks/use-health-appointments";
import {
  useHealthAuthorizations,
  useHealthInsurers,
} from "@/hooks/use-health-insurance";
import { describeError } from "@/lib/errors";
import { usePermissions } from "@/lib/permissions";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/saude/agenda")({
  validateSearch: (search: Record<string, unknown>) => ({
    date:
      typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
        ? search.date
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Agenda — FLUXA Saúde" },
      {
        name: "description",
        content: "Agenda administrativa de atendimentos do FLUXA Saúde.",
      },
    ],
  }),
  component: HealthAgendaPage,
});

const statusLabel: Record<HealthAppointmentStatus, string> = {
  agendado: "Aguardando confirmação",
  confirmado: "Confirmado",
  concluido: "Concluído",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

function visibleStatus(appointment: HealthAppointment) {
  if (["concluido", "faltou", "cancelado"].includes(appointment.status)) {
    return statusLabel[appointment.status];
  }
  if (appointment.reception_status === "chegou") return "Na recepção";
  if (appointment.reception_status === "em_atendimento") return "Em atendimento";
  return statusLabel[appointment.status];
}

function localDateInputValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function waitingTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "chegou agora";
  if (minutes < 60) return `aguardando há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `aguardando há ${hours}h${remainder ? ` ${remainder}min` : ""}`;
}

function localDateTimeParts(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function dateInputFromLocal(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysToDateInput(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateInputFromLocal(date);
}

function weekStartDateInput(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return dateInputFromLocal(date);
}

function formatDayHeading(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  const civilDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${civilDate}`;
}

function HealthAgendaPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const { date: requestedDate } = Route.useSearch();
  const [date, setDate] = useState(requestedDate || localDateInputValue);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [showForm, setShowForm] = useState(false);
  const [billingAppointment, setBillingAppointment] =
    useState<HealthAppointment | null>(null);
  const [reschedulingAppointment, setReschedulingAppointment] =
    useState<HealthAppointment | null>(null);
  const weekStart = useMemo(() => weekStartDateInput(date), [date]);
  const weekEnd = useMemo(() => addDaysToDateInput(weekStart, 6), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysToDateInput(weekStart, index)),
    [weekStart],
  );
  const appointments = useHealthAppointments(
    organizationId,
    date,
    viewMode === "day",
  );
  const weeklyAppointments = useHealthAppointmentsRange(
    organizationId,
    weekStart,
    weekEnd,
    viewMode === "week",
  );
  const patients = useHealthPatients(organizationId, "");
  const professionals = useHealthAppointmentProfessionals(organizationId);
  const create = useCreateHealthAppointment(organizationId);
  const updateStatus = useUpdateHealthAppointmentStatus(organizationId);
  const updateReceptionStatus = useUpdateHealthAppointmentReceptionStatus(organizationId);
  const [form, setForm] = useState({
    patient_profile_id: "",
    professional_user_id: "none",
    service_label: "",
    start_time: "09:00",
    end_time: "10:00",
    location: "",
    administrative_notes: "",
  });

  const activeQuery = viewMode === "week" ? weeklyAppointments : appointments;
  const rows = activeQuery.data ?? [];
  const dayGroups = useMemo(
    () =>
      (viewMode === "week" ? weekDays : [date]).map((groupDate) => ({
        date: groupDate,
        rows: rows.filter(
          (appointment) =>
            (appointment.appointment_date || localDateTimeParts(appointment.starts_at).date) ===
            groupDate,
        ),
      })),
    [date, rows, viewMode, weekDays],
  );
  const counts = useMemo(
    () => ({
      total: rows.length,
      awaitingConfirmation: rows.filter((row) => row.status === "agendado").length,
      confirmed: rows.filter((row) => row.status === "confirmado").length,
      waiting: rows.filter(
        (row) => row.reception_status === "chegou" && !["concluido", "faltou", "cancelado"].includes(row.status),
      ).length,
      inService: rows.filter(
        (row) => row.reception_status === "em_atendimento" && !["concluido", "faltou", "cancelado"].includes(row.status),
      ).length,
      completed: rows.filter((row) => row.status === "concluido").length,
    }),
    [rows],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.patient_profile_id || !form.service_label.trim()) {
      toast.error("Informe o paciente e o serviço.");
      return;
    }

    const starts = new Date(`${date}T${form.start_time}:00`);
    const ends = new Date(`${date}T${form.end_time}:00`);
    if (
      Number.isNaN(starts.getTime()) ||
      Number.isNaN(ends.getTime()) ||
      ends <= starts
    ) {
      toast.error("Confira os horários do atendimento.");
      return;
    }

    try {
      await create.mutateAsync({
        patient_profile_id: form.patient_profile_id,
        professional_user_id:
          form.professional_user_id === "none"
            ? null
            : form.professional_user_id,
        service_label: form.service_label.trim(),
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        location: form.location.trim() || null,
        administrative_notes:
          form.administrative_notes.trim() || null,
      });
      toast.success("Atendimento agendado.");
      setForm((current) => ({
        ...current,
        patient_profile_id: "",
        service_label: "",
        location: "",
        administrative_notes: "",
      }));
      setShowForm(false);
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? "");
      if (message.includes("HEALTH_APPOINTMENT_PROFESSIONAL_CONFLICT")) {
        toast.error("Esse profissional já possui atendimento nesse horário.");
        return;
      }
      if (message.includes("HEALTH_APPOINTMENT_PATIENT_CONFLICT")) {
        toast.error("Esse paciente já possui atendimento nesse horário.");
        return;
      }
      toast.error(describeError(error, "salvar"));
    }
  };

  const changeStatus = async (
    appointmentId: string,
    status: HealthAppointmentStatus,
  ) => {
    try {
      await updateStatus.mutateAsync({ appointmentId, status });
      toast.success(`Atendimento marcado como ${statusLabel[status].toLowerCase()}.`);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  const changeReceptionStatus = async (
    appointmentId: string,
    status: "chegou" | "em_atendimento",
  ) => {
    try {
      await updateReceptionStatus.mutateAsync({ appointmentId, status });
      toast.success(status === "chegou" ? "Chegada registrada." : "Atendimento iniciado.");
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  const navigatePeriod = (direction: -1 | 1) => {
    setDate((current) =>
      addDaysToDateInput(current, direction * (viewMode === "week" ? 7 : 1)),
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-400 text-slate-950">
                <CalendarDays className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-emerald-300 uppercase">
                  FLUXA Saúde
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Agenda e Atendimentos
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Organize horários, pacientes e responsáveis sem registrar prontuário,
              diagnóstico, prescrição ou evolução clínica.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {permissions.canCreate && (
              <Button
                type="button"
                className="bg-white text-slate-950 hover:bg-slate-100"
                onClick={() => setShowForm((value) => !value)}
              >
                <Plus className="size-4" aria-hidden />
                Novo atendimento
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-xl bg-muted p-1">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "day" ? "default" : "ghost"}
            className="flex-1 sm:flex-none"
            onClick={() => setViewMode("day")}
          >
            <CalendarDays className="size-4" aria-hidden />
            Agenda diária
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "week" ? "default" : "ghost"}
            className="flex-1 sm:flex-none"
            onClick={() => setViewMode("week")}
          >
            <CalendarRange className="size-4" aria-hidden />
            Agenda semanal
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={viewMode === "week" ? "Semana anterior" : "Dia anterior"}
            onClick={() => navigatePeriod(-1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDate(localDateInputValue())}
          >
            Hoje
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={viewMode === "week" ? "Próxima semana" : "Próximo dia"}
            onClick={() => navigatePeriod(1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Input
            type="date"
            value={date}
            aria-label="Data da agenda"
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value);
            }}
            className="min-w-40 flex-1 sm:w-44 sm:flex-none"
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          ["Atendimentos", counts.total],
          ["A confirmar", counts.awaitingConfirmation],
          ["Confirmados", counts.confirmed],
          ["Na recepção", counts.waiting],
          ["Em atendimento", counts.inService],
          ["Concluídos", counts.completed],
        ].map(([label, value]) => (
          <Card key={String(label)} className="rounded-2xl border-border/70">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="flex gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <BellRing className="size-4" aria-hidden />
        </span>
        <div>
          <p className="font-medium">Lembretes administrativos automáticos</p>
          <p className="mt-1 text-muted-foreground">
            O FLUXA avisa sobre confirmação nas próximas 24 horas, atendimento
            confirmado em até 2 horas e resultado ainda não atualizado.
          </p>
        </div>
      </div>

      {showForm && permissions.canCreate && (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                <Select
                  value={form.patient_profile_id}
                  onValueChange={(value) =>
                    setForm({ ...form, patient_profile_id: value })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(patients.data ?? [])
                      .filter((patient) => patient.administrative_status === "ativo")
                      .map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Profissional / responsável</Label>
                <Select
                  value={form.professional_user_id}
                  onValueChange={(value) =>
                    setForm({ ...form, professional_user_id: value })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável definido</SelectItem>
                    {(professionals.data ?? []).map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.name || member.email || "Membro da equipe"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appointment-service">Serviço *</Label>
                <Input
                  id="appointment-service"
                  value={form.service_label}
                  maxLength={160}
                  placeholder="Ex.: avaliação, retorno, fisioterapia"
                  onChange={(event) =>
                    setForm({ ...form, service_label: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appointment-start">Início</Label>
                <Input
                  id="appointment-start"
                  type="time"
                  value={form.start_time}
                  onChange={(event) =>
                    setForm({ ...form, start_time: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appointment-end">Fim</Label>
                <Input
                  id="appointment-end"
                  type="time"
                  value={form.end_time}
                  onChange={(event) =>
                    setForm({ ...form, end_time: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appointment-location">Local / sala</Label>
                <Input
                  id="appointment-location"
                  value={form.location}
                  maxLength={120}
                  placeholder="Ex.: Sala 2"
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="appointment-notes">Observação administrativa</Label>
                <Input
                  id="appointment-notes"
                  value={form.administrative_notes}
                  maxLength={240}
                  placeholder="Ex.: levar autorização impressa. Não use este campo para dados clínicos."
                  onChange={(event) =>
                    setForm({ ...form, administrative_notes: event.target.value })
                  }
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {create.isPending ? "Agendando…" : "Agendar atendimento"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="p-4 sm:p-5">
          {activeQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Carregando agenda…
            </div>
          ) : activeQuery.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar a agenda.
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">
                Nenhum atendimento {viewMode === "week" ? "nesta semana" : "neste dia"}.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Escolha outro período ou agende o primeiro horário.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {dayGroups.map((group) => (
                <section key={group.date} className="space-y-3">
                  {viewMode === "week" && (
                    <div className="flex items-center justify-between border-b border-border/70 pb-2">
                      <h2 className="font-semibold capitalize">
                        {formatDayHeading(group.date)}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {group.rows.length} {group.rows.length === 1 ? "atendimento" : "atendimentos"}
                      </span>
                    </div>
                  )}
                  {group.rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                      Nenhum atendimento neste dia.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {group.rows.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border/70 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      <Clock3 className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{appointment.patient_name}</p>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                          {visibleStatus(appointment)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatTime(appointment.starts_at)}–{formatTime(appointment.ends_at)}
                        {" · "}
                        {appointment.service_label}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {appointment.professional_name || "Sem responsável definido"}
                        {appointment.location ? (
                          <>
                            {" · "}
                            <MapPin className="mr-1 inline size-3" aria-hidden />
                            {appointment.location}
                          </>
                        ) : null}
                      </p>
                      {appointment.administrative_notes && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {appointment.administrative_notes}
                        </p>
                      )}
                      {appointment.reception_status === "chegou" &&
                        appointment.checked_in_at &&
                        !["concluido", "faltou", "cancelado"].includes(appointment.status) && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                            <Timer className="size-3.5" aria-hidden />
                            Chegou às {formatTime(appointment.checked_in_at)} · {waitingTime(appointment.checked_in_at)}
                          </p>
                        )}
                      {appointment.reception_status === "em_atendimento" &&
                        appointment.service_started_at &&
                        !["concluido", "faltou", "cancelado"].includes(appointment.status) && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                            <Play className="size-3.5" aria-hidden />
                            Iniciado às {formatTime(appointment.service_started_at)}
                          </p>
                        )}
                      {appointment.billing_item_id && permissions.canViewFinance && (
                        <Button
                          asChild
                          size="sm"
                          variant="link"
                          className="mt-1 h-auto justify-start p-0 text-xs"
                        >
                          <a href="/saude/contas-medicas">
                            <ReceiptText className="size-3.5" aria-hidden />
                            Conta médica criada
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  {permissions.canEdit && (
                      <div className="flex flex-wrap gap-2">
                        {!appointment.billing_item_id &&
                          permissions.canManageFinance &&
                          !["cancelado", "faltou"].includes(appointment.status) && (
                            <Button
                              size="sm"
                              onClick={() => setBillingAppointment(appointment)}
                            >
                              <ReceiptText className="size-4" aria-hidden />
                              {appointment.status === "concluido"
                                ? "Gerar conta"
                                : "Concluir e faturar"}
                            </Button>
                          )}
                        {appointment.status === "agendado" && appointment.reception_status === "aguardando" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateStatus.isPending}
                            onClick={() => void changeStatus(appointment.id, "confirmado")}
                          >
                            Confirmar presença
                          </Button>
                        )}
                        {["agendado", "confirmado"].includes(appointment.status) &&
                          appointment.reception_status === "aguardando" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateReceptionStatus.isPending}
                              onClick={() => void changeReceptionStatus(appointment.id, "chegou")}
                            >
                              <LogIn className="size-4" aria-hidden />
                              Registrar chegada
                            </Button>
                          )}
                        {["agendado", "confirmado"].includes(appointment.status) &&
                          appointment.reception_status === "chegou" && (
                            <Button
                              size="sm"
                              disabled={updateReceptionStatus.isPending}
                              onClick={() => void changeReceptionStatus(appointment.id, "em_atendimento")}
                            >
                              <Play className="size-4" aria-hidden />
                              Iniciar atendimento
                            </Button>
                          )}
                        {["agendado", "confirmado"].includes(appointment.status) &&
                          appointment.reception_status === "aguardando" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReschedulingAppointment(appointment)}
                          >
                            <CalendarClock className="size-4" aria-hidden />
                            Reagendar
                          </Button>
                          )}
                        {!["concluido", "cancelado", "faltou"].includes(appointment.status) && (
                          <>
                            <Button
                              size="sm"
                              variant={permissions.canManageFinance ? "outline" : "default"}
                              disabled={updateStatus.isPending}
                              onClick={() => void changeStatus(appointment.id, "concluido")}
                            >
                              Concluir sem faturar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateStatus.isPending}
                              onClick={() => void changeStatus(appointment.id, "faltou")}
                            >
                              Faltou
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updateStatus.isPending}
                              onClick={() => void changeStatus(appointment.id, "cancelado")}
                            >
                              Cancelar
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {billingAppointment && (
        <AppointmentBillingDialog
          appointment={billingAppointment}
          organizationId={organizationId}
          onClose={() => setBillingAppointment(null)}
        />
      )}
      {reschedulingAppointment && (
        <AppointmentReschedulingDialog
          appointment={reschedulingAppointment}
          organizationId={organizationId}
          professionals={professionals.data ?? []}
          onRescheduled={setDate}
          onClose={() => setReschedulingAppointment(null)}
        />
      )}
    </div>
  );
}

function AppointmentReschedulingDialog({
  appointment,
  organizationId,
  professionals,
  onRescheduled,
  onClose,
}: {
  appointment: HealthAppointment;
  organizationId: string | null;
  professionals: Array<{
    user_id: string;
    name: string | null;
    email: string | null;
  }>;
  onRescheduled: (date: string) => void;
  onClose: () => void;
}) {
  const reschedule = useRescheduleHealthAppointment(organizationId);
  const start = localDateTimeParts(appointment.starts_at);
  const end = localDateTimeParts(appointment.ends_at);
  const [form, setForm] = useState({
    date: start.date,
    start_time: start.time,
    end_time: end.time,
    professional_user_id: appointment.professional_user_id || "none",
    location: appointment.location || "",
  });

  const submitRescheduling = async (event: FormEvent) => {
    event.preventDefault();
    const starts = new Date(`${form.date}T${form.start_time}:00`);
    const ends = new Date(`${form.date}T${form.end_time}:00`);
    if (
      Number.isNaN(starts.getTime()) ||
      Number.isNaN(ends.getTime()) ||
      ends <= starts
    ) {
      toast.error("Confira a data e os horários do atendimento.");
      return;
    }

    try {
      await reschedule.mutateAsync({
        appointment_id: appointment.id,
        professional_user_id:
          form.professional_user_id === "none"
            ? null
            : form.professional_user_id,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        location: form.location.trim() || null,
      });
      toast.success("Atendimento reagendado e aguardando nova confirmação.");
      onRescheduled(form.date);
      onClose();
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? "");
      if (message.includes("HEALTH_APPOINTMENT_PROFESSIONAL_CONFLICT")) {
        toast.error("Esse profissional já possui atendimento nesse horário.");
        return;
      }
      if (message.includes("HEALTH_APPOINTMENT_PATIENT_CONFLICT")) {
        toast.error("Esse paciente já possui atendimento nesse horário.");
        return;
      }
      if (message.includes("HEALTH_APPOINTMENT_RESCHEDULE_NOT_ALLOWED")) {
        toast.error(
          "Somente atendimentos a confirmar ou confirmados podem ser reagendados.",
        );
        return;
      }
      toast.error(describeError(error, "salvar"));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reagendar atendimento</DialogTitle>
          <DialogDescription>
            {appointment.patient_name} · {appointment.service_label}. A mudança
            exigirá uma nova confirmação de presença.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitRescheduling} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-date">Data</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-start">Início</Label>
              <Input
                id="reschedule-start"
                type="time"
                value={form.start_time}
                onChange={(event) =>
                  setForm({ ...form, start_time: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-end">Fim</Label>
              <Input
                id="reschedule-end"
                type="time"
                value={form.end_time}
                onChange={(event) =>
                  setForm({ ...form, end_time: event.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Profissional / responsável</Label>
            <Select
              value={form.professional_user_id}
              onValueChange={(value) =>
                setForm({ ...form, professional_user_id: value })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável definido</SelectItem>
                {professionals.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name || member.email || "Membro da equipe"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reschedule-location">Local / sala</Label>
            <Input
              id="reschedule-location"
              value={form.location}
              maxLength={120}
              placeholder="Ex.: Sala 2"
              onChange={(event) =>
                setForm({ ...form, location: event.target.value })
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={reschedule.isPending}>
              {reschedule.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              {reschedule.isPending ? "Reagendando…" : "Confirmar reagendamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AppointmentBillingDialog({
  appointment,
  organizationId,
  onClose,
}: {
  appointment: HealthAppointment;
  organizationId: string | null;
  onClose: () => void;
}) {
  const insurers = useHealthInsurers(organizationId, "");
  const authorizations = useHealthAuthorizations(organizationId, "");
  const completeAndBill =
    useCompleteHealthAppointmentAndCreateBilling(organizationId);
  const [form, setForm] = useState({
    amount: "",
    insurer_id: "none",
    authorization_id: "none",
    due_date: "",
    administrative_notes: "",
  });

  const availableAuthorizations = (authorizations.data ?? []).filter(
    (authorization) =>
      authorization.patient_profile_id === appointment.patient_profile_id &&
      authorization.status === "autorizado" &&
      (form.insurer_id === "none" || authorization.insurer_id === form.insurer_id),
  );

  const submitBilling = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe um valor válido para a conta médica.");
      return;
    }

    try {
      await completeAndBill.mutateAsync({
        appointment_id: appointment.id,
        amount,
        insurer_id: form.insurer_id === "none" ? null : form.insurer_id,
        authorization_id:
          form.authorization_id === "none" ? null : form.authorization_id,
        due_date: form.due_date || null,
        administrative_notes: form.administrative_notes.trim() || null,
      });
      toast.success("Atendimento concluído e conta médica criada.");
      onClose();
    } catch (error) {
      const message = String((error as { message?: string })?.message ?? "");
      if (message.includes("HEALTH_APPOINTMENT_ALREADY_BILLED")) {
        toast.error("Este atendimento já possui uma conta médica.");
        return;
      }
      toast.error(describeError(error, "faturar"));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir e gerar conta médica</DialogTitle>
          <DialogDescription>
            {appointment.patient_name} · {appointment.service_label}. A conta será criada
            como rascunho para conferência no faturamento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitBilling} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="appointment-billing-amount">Valor *</Label>
            <Input
              id="appointment-billing-amount"
              inputMode="decimal"
              autoFocus
              placeholder="0,00"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Convênio</Label>
              <Select
                value={form.insurer_id}
                onValueChange={(value) =>
                  setForm({ ...form, insurer_id: value, authorization_id: "none" })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Particular / sem convênio</SelectItem>
                  {(insurers.data ?? [])
                    .filter((insurer) => insurer.status === "ativo")
                    .map((insurer) => (
                      <SelectItem key={insurer.id} value={insurer.id}>
                        {insurer.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Autorização</Label>
              <Select
                value={form.authorization_id}
                onValueChange={(value) => {
                  const authorization = availableAuthorizations.find(
                    (item) => item.id === value,
                  );
                  setForm({
                    ...form,
                    authorization_id: value,
                    insurer_id: authorization?.insurer_id || form.insurer_id,
                  });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem autorização</SelectItem>
                  {availableAuthorizations.map((authorization) => (
                    <SelectItem key={authorization.id} value={authorization.id}>
                      {authorization.authorization_number || authorization.service_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appointment-billing-due-date">Vencimento</Label>
            <Input
              id="appointment-billing-due-date"
              type="date"
              value={form.due_date}
              onChange={(event) => setForm({ ...form, due_date: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appointment-billing-notes">Observação administrativa</Label>
            <Input
              id="appointment-billing-notes"
              maxLength={240}
              placeholder="Não use este campo para informações clínicas."
              value={form.administrative_notes}
              onChange={(event) =>
                setForm({ ...form, administrative_notes: event.target.value })
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={completeAndBill.isPending}>
              {completeAndBill.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              {completeAndBill.isPending ? "Gerando…" : "Concluir e gerar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
