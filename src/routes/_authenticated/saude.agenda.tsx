import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Clock3, Loader2, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { useHealthPatients } from "@/hooks/use-health-patients";
import {
  type HealthAppointmentStatus,
  useCreateHealthAppointment,
  useHealthAppointmentProfessionals,
  useHealthAppointments,
  useUpdateHealthAppointmentStatus,
} from "@/hooks/use-health-appointments";
import { describeError } from "@/lib/errors";
import { usePermissions } from "@/lib/permissions";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/saude/agenda")({
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
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

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

function HealthAgendaPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [date, setDate] = useState(localDateInputValue);
  const [showForm, setShowForm] = useState(false);
  const appointments = useHealthAppointments(organizationId, date);
  const patients = useHealthPatients(organizationId, "");
  const professionals = useHealthAppointmentProfessionals(organizationId);
  const create = useCreateHealthAppointment(organizationId);
  const updateStatus = useUpdateHealthAppointmentStatus(organizationId);
  const [form, setForm] = useState({
    patient_profile_id: "",
    professional_user_id: "none",
    service_label: "",
    start_time: "09:00",
    end_time: "10:00",
    location: "",
    administrative_notes: "",
  });

  const rows = appointments.data ?? [];
  const counts = useMemo(
    () => ({
      total: rows.length,
      confirmed: rows.filter((row) => row.status === "confirmado").length,
      completed: rows.filter((row) => row.status === "concluido").length,
      pending: rows.filter((row) =>
        ["agendado", "confirmado"].includes(row.status),
      ).length,
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
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="border-white/15 bg-white text-slate-950 sm:w-44"
            />
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Atendimentos", counts.total],
          ["Em aberto", counts.pending],
          ["Confirmados", counts.confirmed],
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
          {appointments.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Carregando agenda…
            </div>
          ) : appointments.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar a agenda.
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">Nenhum atendimento neste dia.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Escolha outra data ou agende o primeiro horário.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((appointment) => (
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
                          {statusLabel[appointment.status]}
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
                    </div>
                  </div>
                  {permissions.canEdit &&
                    !["concluido", "cancelado", "faltou"].includes(appointment.status) && (
                      <div className="flex flex-wrap gap-2">
                        {appointment.status === "agendado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateStatus.isPending}
                            onClick={() => void changeStatus(appointment.id, "confirmado")}
                          >
                            Confirmar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={updateStatus.isPending}
                          onClick={() => void changeStatus(appointment.id, "concluido")}
                        >
                          Concluir
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
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
