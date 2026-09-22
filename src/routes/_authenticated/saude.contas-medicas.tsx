import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Loader2, Plus, Search } from "lucide-react";
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
import { useHealthAuthorizations, useHealthInsurers } from "@/hooks/use-health-insurance";
import {
  useCreateHealthBillingItem,
  useHealthBillingItems,
  type HealthBillingItem,
} from "@/hooks/use-health-billing";

export const Route = createFileRoute("/_authenticated/saude/contas-medicas")({
  head: () => ({
    meta: [
      { title: "Contas Médicas — FLUXA Saúde" },
      { name: "description", content: "Faturamento administrativo da vertical FLUXA Saúde." },
    ],
  }),
  component: HealthBillingPage,
});

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function HealthBillingPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);

  const query = useHealthBillingItems(organizationId, debounced);
  const patients = useHealthPatients(organizationId, "");
  const insurers = useHealthInsurers(organizationId, "");
  const authorizations = useHealthAuthorizations(organizationId, "");
  const create = useCreateHealthBillingItem(organizationId);

  const [form, setForm] = useState({
    patient_profile_id: "",
    insurer_id: "",
    authorization_id: "",
    service_label: "",
    service_date: new Date().toISOString().slice(0, 10),
    amount: "",
    billed_at: "",
    due_date: "",
    status: "rascunho" as HealthBillingItem["status"],
    administrative_notes: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const rows = query.data ?? [];
  const summary = useMemo(() => {
    const total = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paid = rows.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);
    return { total, paid, open: Math.max(0, total - paid) };
  }, [rows]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount.replace(",", "."));
    if (!form.patient_profile_id || !form.service_label.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe paciente, serviço e valor maior que zero.");
      return;
    }

    try {
      await create.mutateAsync({
        patient_profile_id: form.patient_profile_id,
        insurer_id: form.insurer_id || null,
        authorization_id: form.authorization_id || null,
        service_label: form.service_label.trim(),
        service_date: form.service_date,
        amount,
        billed_at: form.billed_at || null,
        due_date: form.due_date || null,
        status: form.status,
        administrative_notes: form.administrative_notes.trim() || null,
      });
      toast.success("Conta médica cadastrada.");
      setShowForm(false);
      setForm({
        patient_profile_id: "",
        insurer_id: "",
        authorization_id: "",
        service_label: "",
        service_date: new Date().toISOString().slice(0, 10),
        amount: "",
        billed_at: "",
        due_date: "",
        status: "rascunho",
        administrative_notes: "",
      });
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  const patientAuthorizations = (authorizations.data ?? []).filter(
    (item) => !form.patient_profile_id || item.patient_profile_id === form.patient_profile_id,
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-5 text-white sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-violet-400 text-slate-950">
                <FileText className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-violet-300 uppercase">FLUXA Saúde</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Contas Médicas</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Controle administrativo de serviços faturados, valores, convênios, vencimentos e recebimentos.
            </p>
          </div>
          {permissions.canCreate && (
            <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => setShowForm((value) => !value)}>
              <Plus className="size-4" />
              {showForm ? "Fechar cadastro" : "Nova conta médica"}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Faturado</p><p className="mt-1 text-xl font-semibold">{money(summary.total)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recebido</p><p className="mt-1 text-xl font-semibold">{money(summary.paid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Em aberto</p><p className="mt-1 text-xl font-semibold">{money(summary.open)}</p></CardContent></Card>
      </div>

      {showForm && permissions.canCreate && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                <Select value={form.patient_profile_id} onValueChange={(value) => setForm({ ...form, patient_profile_id: value, authorization_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{(patients.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Convênio</Label>
                <Select value={form.insurer_id || "none"} onValueChange={(value) => setForm({ ...form, insurer_id: value === "none" ? "" : value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Particular / sem convênio</SelectItem>
                    {(insurers.data ?? []).filter((i) => i.status === "ativo").map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Autorização</Label>
                <Select value={form.authorization_id || "none"} onValueChange={(value) => setForm({ ...form, authorization_id: value === "none" ? "" : value })}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem autorização vinculada</SelectItem>
                    {patientAuthorizations.map((a) => <SelectItem key={a.id} value={a.id}>{a.service_label} — {a.authorization_number || a.status}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billing-service">Serviço / procedimento *</Label>
                <Input id="billing-service" value={form.service_label} maxLength={180} onChange={(e) => setForm({ ...form, service_label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-date">Data do serviço *</Label>
                <Input id="billing-date" type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-amount">Valor *</Label>
                <Input id="billing-amount" inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Faturado em</Label>
                <Input type="date" value={form.billed_at} onChange={(e) => setForm({ ...form, billed_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as HealthBillingItem["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="enviado">Enviado</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="glosado">Glosado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observação administrativa</Label>
                <Textarea rows={3} maxLength={500} value={form.administrative_notes} onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {create.isPending ? "Salvando…" : "Salvar conta médica"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="relative mb-4 w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar paciente, convênio ou serviço" className="pl-9" />
          </div>
          {query.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma conta médica cadastrada.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Serviço</TableHead><TableHead>Convênio</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.patient_name || "—"}</TableCell>
                      <TableCell><div>{row.service_label}</div><div className="text-xs text-muted-foreground">{new Date(`${row.service_date}T12:00:00`).toLocaleDateString("pt-BR")}</div></TableCell>
                      <TableCell>{row.insurer_name || "Particular"}</TableCell>
                      <TableCell><div>{money(Number(row.amount))}</div><div className="text-xs text-muted-foreground">Recebido {money(Number(row.paid_amount))}</div></TableCell>
                      <TableCell><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">{row.status}</span></TableCell>
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
