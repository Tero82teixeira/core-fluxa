import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleDollarSign, Loader2, Plus, Search } from "lucide-react";
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
import { useHealthBillingItems } from "@/hooks/use-health-billing";
import {
  useCreateHealthDenial,
  useHealthDenials,
  useUpdateHealthDenial,
  type HealthDenial,
} from "@/hooks/use-health-denials";

export const Route = createFileRoute("/_authenticated/saude/glosas")({
  head: () => ({
    meta: [
      { title: "Glosas — FLUXA Saúde" },
      { name: "description", content: "Controle de glosas e recuperação de valores." },
    ],
  }),
  component: HealthDenialsPage,
});

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function HealthDenialsPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HealthDenial | null>(null);

  const query = useHealthDenials(organizationId, debounced);
  const billing = useHealthBillingItems(organizationId, "");
  const create = useCreateHealthDenial(organizationId);
  const update = useUpdateHealthDenial(organizationId);

  const [form, setForm] = useState({
    billing_item_id: "",
    reason: "",
    denied_amount: "",
    denial_code: "",
    received_at: new Date().toISOString().slice(0, 10),
    appeal_due_date: "",
    administrative_notes: "",
  });

  const [resolution, setResolution] = useState({
    status: "em_recurso" as HealthDenial["status"],
    recovered_amount: "",
    appealed_at: "",
    resolved_at: "",
    administrative_notes: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const rows = query.data ?? [];
  const summary = useMemo(() => {
    const denied = rows.reduce((sum, item) => sum + Number(item.denied_amount || 0), 0);
    const recovered = rows.reduce((sum, item) => sum + Number(item.recovered_amount || 0), 0);
    return { denied, recovered, pending: Math.max(0, denied - recovered) };
  }, [rows]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const deniedAmount = Number(form.denied_amount.replace(",", "."));
    if (!form.billing_item_id || !form.reason.trim() || !Number.isFinite(deniedAmount) || deniedAmount <= 0) {
      toast.error("Informe a conta médica, o motivo e o valor glosado.");
      return;
    }

    try {
      await create.mutateAsync({
        billing_item_id: form.billing_item_id,
        reason: form.reason.trim(),
        denied_amount: deniedAmount,
        denial_code: form.denial_code.trim() || null,
        received_at: form.received_at || null,
        appeal_due_date: form.appeal_due_date || null,
        administrative_notes: form.administrative_notes.trim() || null,
      });
      toast.success("Glosa cadastrada.");
      setShowForm(false);
      setForm({
        billing_item_id: "",
        reason: "",
        denied_amount: "",
        denial_code: "",
        received_at: new Date().toISOString().slice(0, 10),
        appeal_due_date: "",
        administrative_notes: "",
      });
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  const saveResolution = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const recovered = Number(resolution.recovered_amount.replace(",", ".") || "0");
    if (!Number.isFinite(recovered) || recovered < 0 || recovered > Number(editing.denied_amount)) {
      toast.error("Informe um valor recuperado válido.");
      return;
    }
    try {
      await update.mutateAsync({
        denial_id: editing.id,
        status: resolution.status,
        recovered_amount: recovered,
        appealed_at: resolution.appealed_at || null,
        resolved_at: resolution.resolved_at || null,
        administrative_notes: resolution.administrative_notes.trim() || null,
      });
      toast.success("Glosa atualizada.");
      setEditing(null);
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-5 text-white sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-rose-400 text-slate-950">
                <CircleDollarSign className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-rose-300 uppercase">FLUXA Saúde</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Glosas</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Registre valores glosados, acompanhe recursos e veja quanto foi recuperado.
            </p>
          </div>
          {permissions.canCreate && (
            <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => setShowForm((value) => !value)}>
              <Plus className="size-4" />
              {showForm ? "Fechar cadastro" : "Nova glosa"}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valor glosado</p><p className="mt-1 text-xl font-semibold">{money(summary.denied)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recuperado</p><p className="mt-1 text-xl font-semibold">{money(summary.recovered)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ainda em risco</p><p className="mt-1 text-xl font-semibold">{money(summary.pending)}</p></CardContent></Card>
      </div>

      {showForm && permissions.canCreate && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Conta médica *</Label>
                <Select value={form.billing_item_id} onValueChange={(value) => setForm({ ...form, billing_item_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(billing.data ?? []).filter((item) => item.status !== "cancelado").map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.patient_name || "Paciente"} — {item.service_label} — {money(Number(item.amount))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="denial-reason">Motivo da glosa *</Label>
                <Input id="denial-reason" value={form.reason} maxLength={220} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="denial-code">Código da glosa</Label>
                <Input id="denial-code" value={form.denial_code} maxLength={80} onChange={(e) => setForm({ ...form, denial_code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="denial-amount">Valor glosado *</Label>
                <Input id="denial-amount" inputMode="decimal" placeholder="0,00" value={form.denied_amount} onChange={(e) => setForm({ ...form, denied_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Recebida em</Label>
                <Input type="date" value={form.received_at} onChange={(e) => setForm({ ...form, received_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo para recurso</Label>
                <Input type="date" value={form.appeal_due_date} onChange={(e) => setForm({ ...form, appeal_due_date: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observação administrativa</Label>
                <Textarea rows={3} maxLength={500} value={form.administrative_notes} onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {create.isPending ? "Salvando…" : "Salvar glosa"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={saveResolution} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="font-semibold">{editing.patient_name} — {editing.service_label}</p>
                <p className="text-sm text-muted-foreground">Glosado: {money(Number(editing.denied_amount))}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={resolution.status} onValueChange={(value) => setResolution({ ...resolution, status: value as HealthDenial["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberta">Aberta</SelectItem>
                    <SelectItem value="em_recurso">Em recurso</SelectItem>
                    <SelectItem value="recuperada">Recuperada</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="mantida">Mantida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor recuperado</Label>
                <Input inputMode="decimal" placeholder="0,00" value={resolution.recovered_amount} onChange={(e) => setResolution({ ...resolution, recovered_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Recurso enviado em</Label>
                <Input type="date" value={resolution.appealed_at} onChange={(e) => setResolution({ ...resolution, appealed_at: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Resolvida em</Label>
                <Input type="date" value={resolution.resolved_at} onChange={(e) => setResolution({ ...resolution, resolved_at: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observação administrativa</Label>
                <Textarea rows={3} maxLength={500} value={resolution.administrative_notes} onChange={(e) => setResolution({ ...resolution, administrative_notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending && <Loader2 className="size-4 animate-spin" />}
                  {update.isPending ? "Salvando…" : "Atualizar glosa"}
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
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar paciente, convênio, código ou motivo" className="pl-9" />
          </div>
          {query.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma glosa cadastrada.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader><TableRow><TableHead>Paciente</TableHead><TableHead>Motivo</TableHead><TableHead>Convênio</TableHead><TableHead>Valores</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.patient_name || "—"}</TableCell>
                      <TableCell><div>{row.reason}</div><div className="text-xs text-muted-foreground">{row.denial_code || row.service_label || "Sem código"}</div></TableCell>
                      <TableCell>{row.insurer_name || "Particular"}</TableCell>
                      <TableCell><div>Glosado {money(Number(row.denied_amount))}</div><div className="text-xs text-muted-foreground">Recuperado {money(Number(row.recovered_amount))}</div></TableCell>
                      <TableCell><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">{row.status.replace("_", " ")}</span></TableCell>
                      <TableCell className="text-right">
                        {permissions.canCreate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(row);
                              setResolution({
                                status: row.status,
                                recovered_amount: String(row.recovered_amount || ""),
                                appealed_at: row.appealed_at || "",
                                resolved_at: row.resolved_at || "",
                                administrative_notes: row.administrative_notes || "",
                              });
                            }}
                          >
                            Atualizar
                          </Button>
                        )}
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
