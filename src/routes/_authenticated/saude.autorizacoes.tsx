import { FormEvent, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Loader2, Plus, Search } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { describeError } from "@/lib/errors";
import { useHealthPatients } from "@/hooks/use-health-patients";
import {
  useCreateHealthAuthorization,
  useHealthAuthorizations,
  useHealthInsurers,
  type HealthAuthorization,
} from "@/hooks/use-health-insurance";

export const Route = createFileRoute("/_authenticated/saude/autorizacoes")({
  head: () => ({
    meta: [
      { title: "Autorizações — FLUXA Saúde" },
      { name: "description", content: "Gestão administrativa de autorizações de atendimento." },
    ],
  }),
  component: HealthAuthorizationsPage,
});

function HealthAuthorizationsPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const query = useHealthAuthorizations(organizationId, debounced);
  const patients = useHealthPatients(organizationId, "");
  const insurers = useHealthInsurers(organizationId, "");
  const create = useCreateHealthAuthorization(organizationId);
  const [form, setForm] = useState({
    patient_profile_id: "",
    insurer_id: "",
    service_label: "",
    authorization_number: "",
    requested_at: new Date().toISOString().slice(0, 10),
    valid_until: "",
    status: "pendente" as HealthAuthorization["status"],
    administrative_notes: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.patient_profile_id) {
      toast.error("Selecione o paciente.");
      return;
    }
    if (!form.service_label.trim()) {
      toast.error("Informe o serviço ou procedimento administrativo.");
      return;
    }

    try {
      await create.mutateAsync({
        patient_profile_id: form.patient_profile_id,
        insurer_id: form.insurer_id || null,
        service_label: form.service_label.trim(),
        authorization_number: form.authorization_number.trim() || null,
        requested_at: form.requested_at || null,
        valid_until: form.valid_until || null,
        status: form.status,
        administrative_notes: form.administrative_notes.trim() || null,
      });
      toast.success("Autorização cadastrada.");
      setForm({
        patient_profile_id: "",
        insurer_id: "",
        service_label: "",
        authorization_number: "",
        requested_at: new Date().toISOString().slice(0, 10),
        valid_until: "",
        status: "pendente",
        administrative_notes: "",
      });
      setShowForm(false);
    } catch (error) {
      toast.error(describeError(error, "autorização"));
    }
  };

  const rows = query.data ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-indigo-400/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-indigo-400 text-slate-950 shadow-lg shadow-indigo-400/20">
                <ClipboardCheck className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-indigo-300 uppercase">FLUXA Saúde</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Autorizações</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Acompanhe solicitações, números de autorização, validade e status administrativo por paciente e convênio.
            </p>
          </div>
          {permissions.canCreate && (
            <Button
              className="w-full rounded-xl bg-white text-slate-950 hover:bg-slate-100 sm:w-auto"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="size-4" />
              {showForm ? "Fechar cadastro" : "Nova autorização"}
            </Button>
          )}
        </div>
      </header>

      {showForm && permissions.canCreate && (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                <Select value={form.patient_profile_id} onValueChange={(value) => setForm({ ...form, patient_profile_id: value })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(patients.data ?? []).map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>{patient.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Convênio</Label>
                <Select value={form.insurer_id || "none"} onValueChange={(value) => setForm({ ...form, insurer_id: value === "none" ? "" : value })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Particular / sem convênio" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem convênio</SelectItem>
                    {(insurers.data ?? []).filter((item) => item.status === "ativo").map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="authorization-service">Serviço / procedimento *</Label>
                <Input id="authorization-service" value={form.service_label} maxLength={180} onChange={(e) => setForm({ ...form, service_label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authorization-number">Número da autorização</Label>
                <Input id="authorization-number" value={form.authorization_number} maxLength={100} onChange={(e) => setForm({ ...form, authorization_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as HealthAuthorization["status"] })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="autorizado">Autorizado</SelectItem>
                    <SelectItem value="negado">Negado</SelectItem>
                    <SelectItem value="expirado">Expirado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authorization-requested">Solicitado em</Label>
                <Input id="authorization-requested" type="date" value={form.requested_at} onChange={(e) => setForm({ ...form, requested_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="authorization-valid">Válido até</Label>
                <Input id="authorization-valid" type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="authorization-notes">Observação administrativa</Label>
                <Textarea id="authorization-notes" rows={3} maxLength={500} value={form.administrative_notes} onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {create.isPending ? "Salvando…" : "Salvar autorização"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="p-4 sm:p-5">
          <div className="relative mb-4 w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar paciente, convênio, serviço ou número" className="rounded-xl pl-9" />
          </div>

          {query.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando autorizações…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <ClipboardCheck className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Nenhuma autorização cadastrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.patient_name || "—"}</TableCell>
                      <TableCell>
                        <div>{row.service_label}</div>
                        <div className="text-xs text-muted-foreground">{row.authorization_number || "Sem número"}</div>
                      </TableCell>
                      <TableCell>{row.insurer_name || "Particular"}</TableCell>
                      <TableCell>{row.valid_until ? new Date(`${row.valid_until}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                          {row.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
