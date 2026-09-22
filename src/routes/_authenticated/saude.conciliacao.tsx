import { FormEvent, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Loader2, Search, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  useHealthBatchPayments,
  useHealthBillingBatches,
  useRecordHealthBatchPayment,
  type HealthBillingBatch,
} from "@/hooks/use-health-billing-batches";

export const Route = createFileRoute("/_authenticated/saude/conciliacao")({
  head: () => ({
    meta: [
      { title: "Conciliação — FLUXA Saúde" },
      {
        name: "description",
        content: "Conciliação de lotes: enviado, recebido, glosado e pendente.",
      },
    ],
  }),
  component: HealthReconciliationPage,
});

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function HealthReconciliationPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<HealthBillingBatch | null>(null);
  const batches = useHealthBillingBatches(organizationId, term);
  const payments = useHealthBatchPayments(organizationId, selected?.id ?? null);
  const recordPayment = useRecordHealthBatchPayment(organizationId);
  const [form, setForm] = useState({
    amount: "",
    received_at: new Date().toISOString().slice(0, 10),
    reference: "",
    administrative_notes: "",
  });

  const rows = batches.data ?? [];
  const totals = useMemo(
    () => ({
      sent: rows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      received: rows.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0),
      denied: rows.reduce((sum, item) => sum + Number(item.denied_amount || 0), 0),
      pending: rows.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0),
    }),
    [rows],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    const amount = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe um valor recebido maior que zero.");
      return;
    }

    try {
      await recordPayment.mutateAsync({
        batch_id: selected.id,
        amount,
        received_at: form.received_at || null,
        reference: form.reference.trim() || null,
        administrative_notes: form.administrative_notes.trim() || null,
      });
      toast.success("Recebimento registrado.");
      setForm({
        amount: "",
        received_at: new Date().toISOString().slice(0, 10),
        reference: "",
        administrative_notes: "",
      });
    } catch (error) {
      toast.error(describeError(error, "salvar"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white sm:p-7">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-emerald-400 text-slate-950">
            <WalletCards className="size-5.5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-emerald-300 uppercase">
              FLUXA Saúde
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Conciliação de Faturamento
            </h1>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
          Compare valor enviado, recebido, glosado e pendente por lote e registre os repasses do convênio.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Enviado</p><p className="mt-1 text-xl font-semibold">{money(totals.sent)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recebido</p><p className="mt-1 text-xl font-semibold">{money(totals.received)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Glosado líquido</p><p className="mt-1 text-xl font-semibold">{money(totals.denied)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pendente</p><p className="mt-1 text-xl font-semibold">{money(totals.pending)}</p></CardContent></Card>
      </div>

      {selected && permissions.canCreate && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="font-semibold">
                  Registrar recebimento — {selected.insurer_name || "Convênio"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selected.reference_period} · Pendente {money(Number(selected.pending_amount || 0))}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Valor recebido *</Label>
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data do recebimento</Label>
                <Input
                  type="date"
                  value={form.received_at}
                  onChange={(e) => setForm({ ...form, received_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Referência / comprovante</Label>
                <Input
                  maxLength={120}
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
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
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                  Fechar
                </Button>
                <Button type="submit" disabled={recordPayment.isPending}>
                  {recordPayment.isPending && <Loader2 className="size-4 animate-spin" />}
                  {recordPayment.isPending ? "Salvando…" : "Registrar recebimento"}
                </Button>
              </div>
            </form>

            <div className="mt-6 border-t pt-4">
              <p className="mb-3 text-sm font-semibold">Histórico de recebimentos</p>
              {payments.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : (payments.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum recebimento registrado.</p>
              ) : (
                <div className="space-y-2">
                  {(payments.data ?? []).map((payment) => (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                      <div>
                        <p className="font-medium">{money(Number(payment.amount))}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(`${payment.received_at}T12:00:00`).toLocaleDateString("pt-BR")}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              <Loader2 className="size-4 animate-spin" /> Carregando conciliação…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum lote disponível para conciliação.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Enviado</TableHead>
                    <TableHead>Recebido</TableHead>
                    <TableHead>Glosado</TableHead>
                    <TableHead>Pendente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.insurer_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.reference_period} · {row.protocol_number || "Sem protocolo"}
                        </div>
                      </TableCell>
                      <TableCell>{money(Number(row.total_amount))}</TableCell>
                      <TableCell>{money(Number(row.paid_amount))}</TableCell>
                      <TableCell>{money(Number(row.denied_amount || 0))}</TableCell>
                      <TableCell>{money(Number(row.pending_amount || 0))}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {permissions.canCreate && row.status !== "rascunho" && row.status !== "cancelado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelected(row)}
                          >
                            <Banknote className="size-4" />
                            Conciliar
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
