import { FormEvent, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HeartPulse, Loader2, Plus, Search, ShieldCheck } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkspace } from "@/lib/workspace";
import { describeError } from "@/lib/errors";
import { usePermissions } from "@/lib/permissions";
import { maskPhone } from "@/lib/format";
import {
  useCreateHealthPatient,
  useHealthPatients,
  type HealthPatient,
} from "@/hooks/use-health-patients";

export const Route = createFileRoute("/_authenticated/saude/pacientes")({
  head: () => ({
    meta: [
      { title: "Pacientes — FLUXA Saúde" },
      {
        name: "description",
        content: "Gestão administrativa de pacientes da vertical FLUXA Saúde.",
      },
    ],
  }),
  component: HealthPatientsPage,
});

function HealthPatientsPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const query = useHealthPatients(organizationId, debounced);
  const create = useCreateHealthPatient(organizationId);
  const [form, setForm] = useState({
    name: "",
    birth_date: "",
    phone: "",
    email: "",
    payer_type: "particular" as HealthPatient["payer_type"],
    insurance_name: "",
    member_number: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const reset = () =>
    setForm({
      name: "",
      birth_date: "",
      phone: "",
      email: "",
      payer_type: "particular",
      insurance_name: "",
      member_number: "",
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do paciente.");
      return;
    }

    try {
      await create.mutateAsync({
        name: form.name.trim(),
        birth_date: form.birth_date || null,
        phone: form.phone || null,
        email: form.email.trim() || null,
        payer_type: form.payer_type,
        insurance_name: form.insurance_name.trim() || null,
        member_number: form.member_number.trim() || null,
      });
      toast.success("Paciente cadastrado.");
      reset();
      setShowForm(false);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  const rows = query.data ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-emerald-400/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/20">
                <HeartPulse className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-emerald-300 uppercase">
                  FLUXA Saúde
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Pacientes</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Cadastro administrativo de pacientes, contato e forma de pagamento. Esta área não é
              prontuário clínico e não registra diagnóstico, prescrição ou evolução médica.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-medium text-white">
                {rows.length} {rows.length === 1 ? "paciente" : "pacientes"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                <ShieldCheck className="size-3.5" aria-hidden />
                Escopo administrativo
              </span>
            </div>
          </div>
          {permissions.canCreate && (
            <Button
              type="button"
              className="w-full rounded-xl bg-white text-slate-950 hover:bg-slate-100 sm:w-auto"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="size-4" aria-hidden />
              {showForm ? "Fechar cadastro" : "Novo paciente"}
            </Button>
          )}
        </div>
      </header>

      {showForm && permissions.canCreate && (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="patient-name">Nome completo *</Label>
                <Input
                  id="patient-name"
                  value={form.name}
                  maxLength={160}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-birth-date">Data de nascimento</Label>
                <Input
                  id="patient-birth-date"
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-phone">Telefone</Label>
                <Input
                  id="patient-phone"
                  value={maskPhone(form.phone)}
                  inputMode="numeric"
                  maxLength={15}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-email">E-mail</Label>
                <Input
                  id="patient-email"
                  type="email"
                  value={form.email}
                  maxLength={160}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de pagamento</Label>
                <Select
                  value={form.payer_type}
                  onValueChange={(value) =>
                    setForm({ ...form, payer_type: value as HealthPatient["payer_type"] })
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="particular">Particular</SelectItem>
                    <SelectItem value="convenio">Convênio</SelectItem>
                    <SelectItem value="pacote">Pacote</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.payer_type === "convenio" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="patient-insurance">Convênio *</Label>
                    <Input
                      id="patient-insurance"
                      value={form.insurance_name}
                      maxLength={120}
                      onChange={(e) => setForm({ ...form, insurance_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="patient-member">Número da carteirinha</Label>
                    <Input
                      id="patient-member"
                      value={form.member_number}
                      maxLength={80}
                      onChange={(e) => setForm({ ...form, member_number: e.target.value })}
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {create.isPending ? "Salvando…" : "Salvar paciente"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="p-4 sm:p-5">
          <div className="relative mb-4 w-full sm:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por nome, contato ou convênio"
              className="rounded-xl pl-9"
            />
          </div>

          {query.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Carregando pacientes…
            </div>
          ) : query.isError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar os pacientes.
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <HeartPulse className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">Nenhum paciente encontrado.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cadastre o primeiro paciente administrativo da sua operação.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell>
                        <div className="font-medium">{patient.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {patient.birth_date
                            ? new Date(`${patient.birth_date}T12:00:00`).toLocaleDateString("pt-BR")
                            : "Nascimento não informado"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{patient.phone ? maskPhone(patient.phone) : "—"}</div>
                        <div className="text-xs text-muted-foreground">{patient.email || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="capitalize">{patient.payer_type.replace("_", " ")}</div>
                        <div className="text-xs text-muted-foreground">
                          {patient.insurance_name || "Sem convênio"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          {patient.administrative_status === "ativo" ? "Ativo" : "Inativo"}
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
