import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { summarizeHealthBilling, parseBillingAmount } from "@/lib/health-billing-summary";
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
  useHealthBillingItemAction,
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

function formatDate(value: string | null) {
  return value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")
    : "Não informado";
}

function HealthBillingPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<"faturar" | "receber" | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toLocaleDateString("en-CA"));
  const [requestId, setRequestId] = useState("");

  const query = useHealthBillingItems(organizationId, debounced);
  const patients = useHealthPatients(organizationId, "");
  const insurers = useHealthInsurers(organizationId, "");
  const authorizations = useHealthAuthorizations(organizationId, "");
  const create = useCreateHealthBillingItem(organizationId);
  const applyAction = useHealthBillingItemAction(organizationId);
  const canManageBilling = [
    "superadmin",
    "proprietario",
    "administrador",
    "gestor",
    "financeiro",
  ].includes(permissions.role || "");

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
  const summary = useMemo(() => summarizeHealthBilling(rows), [rows]);
  const selected = rows.find((row) => row.id === selectedId);
  const remaining = selected
    ? Math.max(0, Number(selected.amount) - Number(selected.paid_amount))
    : 0;

  const startAction = (next: "faturar" | "receber") => {
    setAction(next);
    setRequestId(crypto.randomUUID());
    setPaymentAmount(remaining.toFixed(2).replace(".", ","));
    setReceivedAt(new Date().toLocaleDateString("en-CA"));
  };

  const confirmAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !action || applyAction.isPending) return;
    const amount = parseBillingAmount(paymentAmount);
    if (
      action === "receber" &&
      (!Number.isFinite(amount) || amount <= 0 || amount > remaining || !receivedAt)
    ) {
      toast.error("Informe uma data e um valor maior que zero, até o saldo da conta.");
      return;
    }
    try {
      await applyAction.mutateAsync({
        itemId: selected.id,
        action,
        requestId,
        amount: action === "receber" ? amount : undefined,
        receivedAt: action === "receber" ? receivedAt : undefined,
      });
      toast.success(action === "faturar" ? "Conta faturada." : "Recebimento registrado.");
      setAction(null);
    } catch (error) {
      const message = String((error as { message?: string })?.message || "");
      const actionErrors: Record<string, string> = {
        HEALTH_BILLING_PAYMENT_INVALID:
          "Informe um valor positivo com até duas casas decimais e uma data até hoje.",
        HEALTH_BILLING_PAYMENT_EXCEEDS_BALANCE:
          "O saldo ou status desta conta mudou. Atualize a lista antes de registrar o recebimento.",
        HEALTH_BILLING_REQUEST_CONFLICT:
          "Esta solicitação já foi usada com outros dados. Feche e abra a ação novamente.",
        HEALTH_BILLING_WRITE_DENIED: "Seu perfil não pode alterar esta conta.",
        HEALTH_BILLING_ITEM_NOT_FOUND: "A conta não está disponível nesta organização.",
        HEALTH_BILLING_MODULE_DISABLED: "O módulo de faturamento está desativado.",
        HEALTH_BILLING_USE_BATCH: "Use Lotes de Faturamento e Conciliação para contas de convênio.",
      };
      toast.error(actionErrors[message] || describeError(error, "salvar"));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseBillingAmount(form.amount);
    if (
      !form.patient_profile_id ||
      !form.service_label.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
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
                <p className="text-xs font-semibold tracking-[0.14em] text-violet-300 uppercase">
                  FLUXA Saúde
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Contas Médicas
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Controle administrativo de serviços faturados, valores, convênios, vencimentos e
              recebimentos.
            </p>
          </div>
          {canManageBilling && (
            <Button
              className="bg-white text-slate-950 hover:bg-slate-100"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="size-4" />
              {showForm ? "Fechar cadastro" : "Nova conta médica"}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Em rascunho</p>
            <p className="mt-1 text-xl font-semibold">{money(summary.drafts)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Faturado</p>
            <p className="mt-1 text-xl font-semibold">{money(summary.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Recebido</p>
            <p className="mt-1 text-xl font-semibold">{money(summary.paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Em aberto</p>
            <p className="mt-1 text-xl font-semibold">{money(summary.open)}</p>
          </CardContent>
        </Card>
      </div>

      {showForm && canManageBilling && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Paciente *</Label>
                <Select
                  value={form.patient_profile_id}
                  onValueChange={(value) =>
                    setForm({ ...form, patient_profile_id: value, authorization_id: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(patients.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Convênio</Label>
                <Select
                  value={form.insurer_id || "none"}
                  onValueChange={(value) =>
                    setForm({ ...form, insurer_id: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Particular / sem convênio</SelectItem>
                    {(insurers.data ?? [])
                      .filter((i) => i.status === "ativo")
                      .map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Autorização</Label>
                <Select
                  value={form.authorization_id || "none"}
                  onValueChange={(value) =>
                    setForm({ ...form, authorization_id: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem autorização vinculada</SelectItem>
                    {patientAuthorizations.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.service_label} — {a.authorization_number || a.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="billing-service">Serviço / procedimento *</Label>
                <Input
                  id="billing-service"
                  value={form.service_label}
                  maxLength={180}
                  onChange={(e) => setForm({ ...form, service_label: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-date">Data do serviço *</Label>
                <Input
                  id="billing-date"
                  type="date"
                  value={form.service_date}
                  onChange={(e) => setForm({ ...form, service_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="billing-amount">Valor *</Label>
                <Input
                  id="billing-amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Faturado em</Label>
                <Input
                  type="date"
                  value={form.billed_at}
                  onChange={(e) => setForm({ ...form, billed_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm({ ...form, status: value as HealthBillingItem["status"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="enviado">Enviado</SelectItem>
                  </SelectContent>
                </Select>
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
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
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
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar paciente, convênio ou serviço"
              className="pl-9"
            />
          </div>
          {query.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          ) : query.isError ? (
            <div role="alert" className="space-y-3 rounded-xl border p-6">
              <p>{describeError(query.error, "carregar")}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma conta médica cadastrada.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.patient_name || "—"}</TableCell>
                      <TableCell>
                        <div>{row.service_label}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(`${row.service_date}T12:00:00`).toLocaleDateString("pt-BR")}
                        </div>
                      </TableCell>
                      <TableCell>{row.insurer_name || "Particular"}</TableCell>
                      <TableCell>
                        <div>{money(Number(row.amount))}</div>
                        <div className="text-xs text-muted-foreground">
                          Recebido {money(Number(row.paid_amount))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Ver detalhes da conta de ${row.patient_name || "paciente"}, ${row.service_label}`}
                          onClick={() => {
                            setSelectedId(row.id);
                            setAction(null);
                          }}
                        >
                          Ver detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open && !applyAction.isPending) {
            setSelectedId(null);
            setAction(null);
          }
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (applyAction.isPending) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (applyAction.isPending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Detalhes da conta médica</DialogTitle>
            <DialogDescription>
              Confira a conta e registre apenas recebimentos já realizados.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Paciente</dt>
                  <dd>{selected.patient_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="capitalize">{selected.status}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Serviço</dt>
                  <dd>{selected.service_label}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Data do serviço</dt>
                  <dd>{formatDate(selected.service_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Vencimento</dt>
                  <dd>{formatDate(selected.due_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Convênio</dt>
                  <dd>{selected.insurer_name || "Particular"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Faturado em</dt>
                  <dd>{formatDate(selected.billed_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Valor</dt>
                  <dd>{money(Number(selected.amount))}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recebido</dt>
                  <dd>{money(Number(selected.paid_amount))}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Observação administrativa</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {selected.administrative_notes || "—"}
                  </dd>
                </div>
              </dl>
              {selected.appointment_id && (
                <Button variant="outline" asChild>
                  <Link to="/saude/agenda" search={{ date: selected.service_date }}>
                    Consultar atendimento na Agenda ({formatDate(selected.service_date)})
                  </Link>
                </Button>
              )}
              {selected.insurer_id ? (
                <p className="text-sm text-muted-foreground">
                  O envio e o recebimento de contas de convênio são realizados em Lotes de
                  Faturamento e Conciliação.
                </p>
              ) : (
                canManageBilling &&
                !action && (
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "rascunho" && (
                      <Button onClick={() => startAction("faturar")}>
                        Faturar conta particular
                      </Button>
                    )}
                    {["enviado", "parcial"].includes(selected.status) && remaining > 0 && (
                      <Button onClick={() => startAction("receber")}>Registrar recebimento</Button>
                    )}
                  </div>
                )
              )}
              {action && (
                <form onSubmit={confirmAction} className="space-y-4 rounded-xl border p-4">
                  <p className="text-sm">
                    {action === "faturar"
                      ? "Confirmar o faturamento desta conta particular? Isso não envia uma cobrança nem movimenta dinheiro."
                      : `Saldo a receber: ${money(remaining)}. Este registro não realiza uma cobrança.`}
                  </p>
                  {action === "receber" && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="received-amount">Valor recebido</Label>
                        <Input
                          id="received-amount"
                          inputMode="decimal"
                          value={paymentAmount}
                          disabled={applyAction.isPending}
                          onChange={(event) => {
                            setPaymentAmount(event.target.value);
                            setRequestId(crypto.randomUUID());
                          }}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="received-date">Data do recebimento</Label>
                        <Input
                          id="received-date"
                          type="date"
                          value={receivedAt}
                          disabled={applyAction.isPending}
                          onChange={(event) => {
                            setReceivedAt(event.target.value);
                            setRequestId(crypto.randomUUID());
                          }}
                          required
                        />
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={applyAction.isPending}
                      onClick={() => setAction(null)}
                    >
                      Voltar
                    </Button>
                    <Button type="submit" disabled={applyAction.isPending}>
                      {applyAction.isPending ? "Salvando…" : "Confirmar"}
                    </Button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <p>
              A conta não está mais disponível nesta lista. Feche os detalhes e atualize a busca.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
