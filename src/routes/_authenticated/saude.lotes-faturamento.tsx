import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Loader2, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useHealthInsurers } from "@/hooks/use-health-insurance";
import {
  useCreateHealthBillingBatch,
  useHealthBillingBatches,
  useSubmitHealthBillingBatch,
  type HealthBillingBatch,
} from "@/hooks/use-health-billing-batches";

export const Route = createFileRoute("/_authenticated/saude/lotes-faturamento")({
  head: () => ({
    meta: [
      { title: "Lotes de Faturamento — FLUXA Saúde" },
      { name: "description", content: "Agrupamento e acompanhamento de lotes de contas médicas." },
    ],
  }),
  component: HealthBillingBatchesPage,
});

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function HealthBillingBatchesPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState<HealthBillingBatch | null>(null);

  const batches = useHealthBillingBatches(organizationId, debounced);
  const billingItems = useHealthBillingItems(organizationId, "");
  const insurers = useHealthInsurers(organizationId, "");
  const create = useCreateHealthBillingBatch(organizationId);
  const submitBatch = useSubmitHealthBillingBatch(organizationId);

  const [form, setForm] = useState({
    insurer_id: "",
    reference_period: "",
    expected_payment_at: "",
    administrative_notes: "",
    billing_item_ids: [] as string[],
  });

  const [submission, setSubmission] = useState({
    protocol_number: "",
    submitted_at: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const eligibleItems = useMemo(
    () =>
      (billingItems.data ?? []).filter(
        (item) =>
          item.insurer_id === form.insurer_id &&
          ["rascunho", "enviado", "parcial", "glosado"].includes(item.status),
      ),
    [billingItems.data, form.insurer_id],
  );

  const selectedTotal = eligibleItems
    .filter((item) => form.billing_item_ids.includes(item.id))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const rows = batches.data ?? [];
  const totals = useMemo(
    () => ({
      batches: rows.length,
      sent: rows.filter((item) => item.status !== "rascunho").length,
      amount: rows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    }),
    [rows],
  );

  const toggleItem = (id: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      billing_item_ids: checked
        ? Array.from(new Set([...current.billing_item_ids, id]))
        : current.billing_item_ids.filter((item) => item !== id),
    }));
  };

  const createBatch = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.insurer_id || !form.reference_period.trim() || form.billing_item_ids.length === 0) {
      toast.error("Informe convênio, período de referência e selecione ao menos uma conta médica.");
      return;
    }

    try {
      await create.mutateAsync({
        insurer_id: form.insurer_id,
        reference_period: form.reference_period.trim(),
        billing_item_ids: form.billing_item_ids,
        expected_payment_at: form.expected_payment_at || null,
        administrative_notes: form.administrative_notes.trim() || null,
      });
      toast.success("Lote de faturamento criado.");
      setShowForm(false);
      setForm({
        insurer_id: "",
        reference_period: "",
        expected_payment_at: "",
        administrative_notes: "",
        billing_item_ids: [],
      });
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!submitting || !submission.protocol_number.trim()) {
      toast.error("Informe o número do protocolo.");
      return;
    }

    try {
      await submitBatch.mutateAsync({
        batch_id: submitting.id,
        protocol_number: submission.protocol_number.trim(),
        submitted_at: submission.submitted_at || null,
      });
      toast.success("Lote marcado como enviado.");
      setSubmitting(null);
      setSubmission({
        protocol_number: "",
        submitted_at: new Date().toISOString().slice(0, 10),
      });
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-cyan-400 text-slate-950">
                <ClipboardList className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-cyan-300 uppercase">FLUXA Saúde</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Lotes de Faturamento</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Agrupe contas médicas por convênio, registre protocolo e acompanhe o envio do faturamento.
            </p>
          </div>
          {permissions.canCreate && (
            <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => setShowForm((value) => !value)}>
              <Plus className="size-4" />
              {showForm ? "Fechar lote" : "Novo lote"}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Lotes</p><p className="mt-1 text-xl font-semibold">{totals.batches}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Já enviados</p><p className="mt-1 text-xl font-semibold">{totals.sent}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valor agrupado</p><p className="mt-1 text-xl font-semibold">{money(totals.amount)}</p></CardContent></Card>
      </div>

      {showForm && permissions.canCreate && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={createBatch} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Convênio *</Label>
                <Select
                  value={form.insurer_id}
                  onValueChange={(value) =>
                    setForm({ ...form, insurer_id: value, billing_item_ids: [] })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(insurers.data ?? []).filter((item) => item.status === "ativo").map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batch-reference">Período de referência *</Label>
                <Input
                  id="batch-reference"
                  placeholder="Ex.: 09/2026"
                  maxLength={30}
                  value={form.reference_period}
                  onChange={(e) => setForm({ ...form, reference_period: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Previsão de pagamento</Label>
                <Input
                  type="date"
                  value={form.expected_payment_at}
                  onChange={(e) => setForm({ ...form, expected_payment_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Contas médicas *</Label>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border p-3">
                  {!form.insurer_id ? (
                    <p className="text-sm text-muted-foreground">Selecione um convênio para ver as contas disponíveis.</p>
                  ) : eligibleItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma conta disponível para este convênio.</p>
                  ) : (
                    eligibleItems.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                        <Checkbox
                          checked={form.billing_item_ids.includes(item.id)}
                          onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{item.patient_name || "Paciente"} — {item.service_label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {new Date(`${item.service_date}T12:00:00`).toLocaleDateString("pt-BR")} · {money(Number(item.amount))}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecionadas: {form.billing_item_ids.length} · Total: {money(selectedTotal)}
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observação administrativa</Label>
                <Textarea
                  rows={3}
                  maxLength={500}
                  value={form.administrative_notes}
                  onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {create.isPending ? "Criando…" : "Criar lote"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {submitting && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="font-semibold">Enviar lote — {submitting.insurer_name}</p>
                <p className="text-sm text-muted-foreground">
                  {submitting.reference_period} · {submitting.item_count} contas · {money(Number(submitting.total_amount))}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Número do protocolo *</Label>
                <Input
                  value={submission.protocol_number}
                  maxLength={120}
                  onChange={(e) => setSubmission({ ...submission, protocol_number: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data do envio</Label>
                <Input
                  type="date"
                  value={submission.submitted_at}
                  onChange={(e) => setSubmission({ ...submission, submitted_at: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setSubmitting(null)}>Cancelar</Button>
                <Button type="submit" disabled={submitBatch.isPending}>
                  {submitBatch.isPending && <Loader2 className="size-4 animate-spin" />}
                  {submitBatch.isPending ? "Enviando…" : "Registrar envio"}
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
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar convênio, período ou protocolo"
              className="pl-9"
            />
          </div>

          {batches.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando lotes…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum lote de faturamento cadastrado.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead>Contas</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.insurer_name || "—"}</TableCell>
                      <TableCell>{row.reference_period}</TableCell>
                      <TableCell>{row.item_count}</TableCell>
                      <TableCell>
                        <div>{money(Number(row.total_amount))}</div>
                        <div className="text-xs text-muted-foreground">Recebido {money(Number(row.paid_amount))}</div>
                      </TableCell>
                      <TableCell>{row.protocol_number || "—"}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {permissions.canCreate && ["rascunho", "rejeitado"].includes(row.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSubmitting(row);
                              setSubmission({
                                protocol_number: row.protocol_number || "",
                                submitted_at: row.submitted_at || new Date().toISOString().slice(0, 10),
                              });
                            }}
                          >
                            <Send className="size-4" />
                            Enviar
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
