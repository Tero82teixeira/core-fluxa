import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, startOfDay } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Plus,
  Search,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHealthPatients } from "@/hooks/use-health-patients";
import { useHealthAuthorizations } from "@/hooks/use-health-insurance";
import {
  useCreateHealthAppointment,
  useHealthAppointments,
  useUpdateHealthAppointmentStatus,
  type HealthAppointmentModality,
  type HealthAppointmentStatus,
} from "@/hooks/use-health-appointments";
import { useTeamMembers } from "@/hooks/use-team";
import { describeError } from "@/lib/errors";
import { usePermissions } from "@/lib/permissions";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/saude/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda e Atendimentos — FLUXA Saúde" },
      {
        name: "description",
        content: "Agenda administrativa de pacientes e atendimentos do FLUXA Saúde.",
      },
    ],
  }),
  component: HealthAppointmentsPage,
});

const STATUS: Record<HealthAppointmentStatus, { label: string; className: string }> = {
  agendado: { label: "Agendado", className: "border-sky-200 bg-sky-50 text-sky-700" },
  confirmado: { label: "Confirmado", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  em_atendimento: { label: "Em atendimento", className: "border-amber-200 bg-amber-50 text-amber-800" },
  concluido: { label: "Concluído", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  faltou: { label: "Faltou", className: "border-orange-200 bg-orange-50 text-orange-700" },
  cancelado: { label: "Cancelado", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const MODALITY: Record<HealthAppointmentModality, string> = {
  presencial: "Presencial",
  remoto: "Remoto",
  domiciliar: "Domiciliar",
  outro: "Outro",
};

const initialForm = () => ({
  patient_profile_id: "",
  responsible_user_id: "",
  authorization_id: "",
  service_label: "",
  date: format(new Date(), "yyyy-MM-dd"),
  starts_time: "09:00",
  ends_time: "10:00",
  modality: "presencial" as HealthAppointmentModality,
  location: "",
  administrative_notes: "",
});

function localIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function HealthAppointmentsPage() {
  const { organizationId, role } = useWorkspace();
  const permissions = usePermissions();
  const canManage = permissions.canEdit || role === "atendimento";
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [days, setDays] = useState<1 | 7>(1);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<HealthAppointmentStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);

  const range = useMemo(() => {
    const from = startOfDay(new Date(`${selectedDate}T12:00:00`));
    return { from, until: addDays(from, days) };
  }, [selectedDate, days]);

  const appointments = useHealthAppointments(organizationId, {
    startsFrom: range.from.toISOString(),
    startsUntil: range.until.toISOString(),
    search: debounced,
    status: status === "all" ? null : status,
  });
  const patients = useHealthPatients(organizationId, "");
  const authorizations = useHealthAuthorizations(organizationId, "");
  const team = useTeamMembers(organizationId);
  const create = useCreateHealthAppointment(organizationId);
  const updateStatus = useUpdateHealthAppointmentStatus(organizationId);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const rows = appointments.data ?? [];
  const activeAuthorizations = (authorizations.data ?? []).filter(
    (item) => item.patient_profile_id === form.patient_profile_id && item.status === "autorizado",
  );
  const openCount = rows.filter((item) =>
    ["agendado", "confirmado", "em_atendimento"].includes(item.status),
  ).length;
  const confirmedCount = rows.filter((item) => item.status === "confirmado").length;
  const completedCount = rows.filter((item) => item.status === "concluido").length;

  const moveDate = (amount: number) => {
    const current = new Date(`${selectedDate}T12:00:00`);
    setSelectedDate(format(addDays(current, amount), "yyyy-MM-dd"));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.patient_profile_id) return toast.error("Selecione o paciente.");
    if (!form.service_label.trim()) return toast.error("Informe o serviço ou atendimento.");

    const startsAt = localIso(form.date, form.starts_time);
    const endsAt = localIso(form.date, form.ends_time);
    if (new Date(endsAt) <= new Date(startsAt)) {
      toast.error("O horário final deve ser posterior ao horário inicial.");
      return;
    }

    try {
      await create.mutateAsync({
        patient_profile_id: form.patient_profile_id,
        responsible_user_id: form.responsible_user_id || null,
        authorization_id: form.authorization_id || null,
        service_label: form.service_label.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        modality: form.modality,
        location: form.location.trim() || null,
        administrative_notes: form.administrative_notes.trim() || null,
      });
      toast.success("Atendimento agendado.");
      setSelectedDate(form.date);
      setForm(initialForm());
      setShowForm(false);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  const changeStatus = async (id: string, nextStatus: HealthAppointmentStatus) => {
    try {
      await updateStatus.mutateAsync({ id, status: nextStatus });
      toast.success(`Atendimento marcado como ${STATUS[nextStatus].label.toLowerCase()}.`);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-cyan-950 to-teal-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-cyan-300/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-400/20">
                <CalendarDays className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-cyan-200 uppercase">FLUXA Saúde</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Agenda e Atendimentos</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200">
              Organize horários, pacientes, responsáveis e confirmações sem armazenar informações de prontuário clínico.
            </p>
          </div>
          {canManage && (
            <Button
              className="w-full rounded-xl bg-white text-slate-950 hover:bg-slate-100 sm:w-auto"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="size-4" />
              {showForm ? "Fechar cadastro" : "Novo atendimento"}
            </Button>
          )}
        </div>
      </header>

      {showForm && canManage && (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                <Select
                  value={form.patient_profile_id}
                  onValueChange={(value) => setForm({ ...form, patient_profile_id: value, authorization_id: "" })}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(patients.data ?? []).filter((item) => item.administrative_status === "ativo").map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>{patient.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Profissional responsável</Label>
                <Select
                  value={form.responsible_user_id || "none"}
                  onValueChange={(value) => setForm({ ...form, responsible_user_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Não definido" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definido</SelectItem>
                    {(team.data ?? []).filter((item) => item.is_active && item.role !== "cliente_externo").map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name || member.email || "Membro da equipe"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Autorização</Label>
                <Select
                  value={form.authorization_id || "none"}
                  onValueChange={(value) => setForm({ ...form, authorization_id: value === "none" ? "" : value })}
                  disabled={!form.patient_profile_id}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Sem autorização vinculada" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem autorização vinculada</SelectItem>
                    {activeAuthorizations.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.service_label}{item.authorization_number ? ` · ${item.authorization_number}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="appointment-service">Serviço / atendimento *</Label>
                <Input
                  id="appointment-service"
                  value={form.service_label}
                  maxLength={180}
                  placeholder="Ex.: consulta inicial, retorno ou sessão"
                  onChange={(event) => setForm({ ...form, service_label: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appointment-date">Data *</Label>
                <Input id="appointment-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="appointment-start">Início *</Label>
                  <Input id="appointment-start" type="time" value={form.starts_time} onChange={(event) => setForm({ ...form, starts_time: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appointment-end">Fim *</Label>
                  <Input id="appointment-end" type="time" value={form.ends_time} onChange={(event) => setForm({ ...form, ends_time: event.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Modalidade</Label>
                <Select value={form.modality} onValueChange={(value) => setForm({ ...form, modality: value as HealthAppointmentModality })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODALITY).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="appointment-location">Local / sala / link</Label>
                <Input id="appointment-location" value={form.location} maxLength={180} onChange={(event) => setForm({ ...form, location: event.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="appointment-notes">Observação administrativa</Label>
                <Textarea
                  id="appointment-notes"
                  rows={3}
                  maxLength={500}
                  placeholder="Não inclua diagnóstico, prescrição ou evolução clínica."
                  value={form.administrative_notes}
                  onChange={(event) => setForm({ ...form, administrative_notes: event.target.value })}
                />
              </div>
              <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-3">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {create.isPending ? "Agendando…" : "Agendar atendimento"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={Clock3} label="Em aberto" value={openCount} />
        <SummaryCard icon={UserRoundCheck} label="Confirmados" value={confirmedCount} />
        <SummaryCard icon={CheckCircle2} label="Concluídos" value={completedCount} />
      </section>

      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Período anterior" onClick={() => moveDate(-days)}><ChevronLeft className="size-4" /></Button>
              <Input className="w-40" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              <Button variant="outline" size="icon" aria-label="Próximo período" onClick={() => moveDate(days)}><ChevronRight className="size-4" /></Button>
              <Button variant="ghost" onClick={() => setSelectedDate(format(new Date(), "yyyy-MM-dd"))}>Hoje</Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={String(days)} onValueChange={(value) => setDays(Number(value) as 1 | 7)}>
                <SelectTrigger className="w-full rounded-xl sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">Dia</SelectItem><SelectItem value="7">7 dias</SelectItem></SelectContent>
              </Select>
              <Select value={status} onValueChange={(value) => setStatus(value as HealthAppointmentStatus | "all")}>
                <SelectTrigger className="w-full rounded-xl sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {Object.entries(STATUS).map(([value, item]) => <SelectItem key={value} value={value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={term} placeholder="Paciente, serviço ou profissional" onChange={(event) => setTerm(event.target.value)} />
              </div>
            </div>
          </div>

          {appointments.isLoading ? (
            <div className="grid min-h-44 place-items-center text-sm text-muted-foreground"><Loader2 className="mb-2 size-5 animate-spin" />Carregando agenda…</div>
          ) : appointments.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">{describeError(appointments.error, "carregar")}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <CalendarDays className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">Nenhum atendimento neste período.</p>
              <p className="mt-1 text-sm text-muted-foreground">Altere os filtros ou agende um novo atendimento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((appointment) => {
                const starts = new Date(appointment.starts_at);
                const ends = new Date(appointment.ends_at);
                return (
                  <article key={appointment.id} className="grid gap-4 rounded-2xl border border-border/70 p-4 transition-colors hover:bg-muted/30 sm:grid-cols-[110px_1fr_auto] sm:items-center">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {starts.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {starts.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        <span className="text-sm font-normal text-muted-foreground"> – {ends.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold">{appointment.patient_name}</h2>
                        <Badge variant="outline" className={STATUS[appointment.status].className}>{STATUS[appointment.status].label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-foreground/80">{appointment.service_label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {appointment.responsible_name || "Sem profissional definido"} · {MODALITY[appointment.modality]}
                        {appointment.location ? ` · ${appointment.location}` : ""}
                        {appointment.authorization_number ? ` · Aut. ${appointment.authorization_number}` : ""}
                      </p>
                    </div>
                    {canManage ? (
                      <Select value={appointment.status} onValueChange={(value) => void changeStatus(appointment.id, value as HealthAppointmentStatus)} disabled={updateStatus.isPending}>
                        <SelectTrigger className="w-full rounded-xl sm:w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS).map(([value, item]) => <SelectItem key={value} value={value}>{item.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">Somente leitura</span>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: number }) {
  return (
    <Card className="rounded-2xl border-border/70 shadow-soft">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-cyan-500/10 text-cyan-700"><Icon className="size-5" /></span>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p></div>
      </CardContent>
    </Card>
  );
}
