import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  History,
  Plus,
  Printer,
  RefreshCw,
  Undo2,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AccountsManager, CategoriesManager } from "@/components/finance/financial-structures";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFinance, useFinancialAction, useFinancialPayment } from "@/hooks/use-finance";
import {
  availableFinancialAccounts,
  availableFinancialCategories,
  brDate,
  brl,
  canManageFinance,
  canReverseFinancialPayment,
  displayedFinancialStatus,
  downloadFinancialCsv,
  financialBuckets,
  type FinancialAccount,
  type FinancialCategory,
  type FinancialType,
} from "@/lib/finance";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — FLUXA" },
      { name: "description", content: "Gestão financeira segura da organização." },
    ],
  }),
  component: FinancePage,
});
const colors = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed"];
const statusLabel: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function FinancePage() {
  const { organizationId, membership, role } = useWorkspace();
  const query = useFinance(organizationId);
  const action = useFinancialAction(organizationId);
  const payment = useFinancialPayment(organizationId);
  if (!organizationId)
    return (
      <div className="p-6">
        <h1 className="page-title">Financeiro</h1>
        <p>Selecione uma organização ativa.</p>
      </div>
    );
  if (query.isError)
    return (
      <div className="finance-page mx-auto w-full max-w-7xl p-4 sm:p-6">
        <h1 className="page-title">Financeiro</h1>
        <Card>
          <CardContent role="alert" className="p-6 text-destructive">
            <AlertTriangle className="inline" /> Não foi possível carregar.{" "}
            <Button onClick={() => query.refetch()}>Tentar novamente</Button>
          </CardContent>
        </Card>
      </div>
    );
  if (query.isLoading || !query.data)
    return (
      <div className="finance-page mx-auto w-full max-w-7xl p-4 sm:p-6">
        <h1 className="page-title">Financeiro</h1>
        <Card>
          <CardContent className="p-8 text-center">Carregando dados financeiros reais…</CardContent>
        </Card>
      </div>
    );
  return <FinanceDashboard {...{ membership, role, action, payment }} data={query.data} />;
}

function FinanceDashboard({ membership, role, action, payment, data }: any) {
  const [tab, setTab] = useState("overview"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [type, setType] = useState("all"),
    [category, setCategory] = useState("all"),
    [account, setAccount] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(0);
  const editable = canManageFinance(role);
  const rows = useMemo(
    () =>
      data.transactions.filter(
        (x: any) =>
          !x.archived_at &&
          (type === "all" || x.type === type) &&
          (status === "all" || x.status === status) &&
          (category === "all" || x.category_id === category) &&
          (account === "all" || x.account_id === account) &&
          (!from || x.due_date >= from) &&
          (!to || x.due_date <= to) &&
          JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
      ),
    [data, type, status, category, account, from, to, search],
  );
  const paid = (id: string) =>
    data.payments
      .filter((x: any) => x.transaction_id === id && !x.reversed_at)
      .reduce((n: number, x: any) => n + Number(x.amount), 0);
  const now = new Date();
  const metrics = useMemo(() => {
    const tx = data.transactions.filter((x: any) => !x.archived_at && x.status !== "cancelled"),
      month = now.toISOString().slice(0, 7),
      open = tx.filter((x: any) => x.status !== "paid");
    const sum = (r: any[]) => r.reduce((n, x) => n + Number(x.amount), 0);
    return [
      ["Saldo atual", sum(data.accounts.map((x: any) => ({ amount: x.current_balance })))],
      ["Total a receber", sum(open.filter((x: any) => x.type === "income"))],
      ["Total a pagar", sum(open.filter((x: any) => x.type === "expense"))],
      [
        "Receitas do mês",
        sum(tx.filter((x: any) => x.type === "income" && x.due_date.startsWith(month))),
      ],
      [
        "Despesas do mês",
        sum(tx.filter((x: any) => x.type === "expense" && x.due_date.startsWith(month))),
      ],
      [
        "Valores vencidos",
        sum(open.filter((x: any) => financialBuckets(x.due_date, x.status, now).overdue)),
      ],
      [
        "Vencendo em 7 dias",
        sum(open.filter((x: any) => financialBuckets(x.due_date, x.status, now).in7)),
      ],
      [
        "Vencendo em 30 dias",
        sum(open.filter((x: any) => financialBuckets(x.due_date, x.status, now).in30)),
      ],
    ] as [string, number][];
  }, [data]);
  const monthIncome = metrics.find((x) => x[0] === "Receitas do mês")?.[1] ?? 0,
    monthExpense = metrics.find((x) => x[0] === "Despesas do mês")?.[1] ?? 0;
  const chart = monthly(data?.transactions ?? []),
    expenseCategories = byCategory(data, "expense"),
    incomeCategories = byCategory(data, "income");
  const exportRows = () =>
    downloadFinancialCsv(
      tab,
      rows.map((x: any) => ({
        Descrição: x.description,
        Tipo: x.type === "income" ? "Receita" : "Despesa",
        Valor: brl(Number(x.amount)),
        Vencimento: brDate(x.due_date),
        Status: statusLabel[x.status],
        Pago: brl(paid(x.id)),
        Saldo: brl(Number(x.amount) - paid(x.id)),
      })),
    );
  return (
    <div className="finance-page mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="print-header flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="page-subtitle">
            Visão financeira real de{" "}
            {membership?.organizations?.trade_name || membership?.organizations?.legal_name}.
          </p>
          <p className="hidden print:block">
            Gerado em {new Date().toLocaleString("pt-BR")} · Período{" "}
            {from ? brDate(from) : "início"} a {to ? brDate(to) : "hoje"}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Imprimir / PDF
          </Button>
          <Button variant="outline" disabled={!rows.length} onClick={exportRows}>
            <Download />
            CSV
          </Button>
          {editable && (
            <TransactionDialog
              data={data}
              onSave={async (payload: Record<string, unknown>) => {
                await action.mutateAsync({ rpc: "create_financial_transaction", payload });
                toast.success("Lançamento criado.");
              }}
            />
          )}
        </div>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print h-auto flex-wrap">
          {[
            ["overview", "Visão geral"],
            ["receivable", "Contas a receber"],
            ["payable", "Contas a pagar"],
            ["income", "Receitas"],
            ["expense", "Despesas"],
            ["cashflow", "Fluxo de caixa"],
            ["categories", "Categorias"],
            ["accounts", "Contas"],
            ["recurrences", "Recorrências"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...metrics, ["Resultado do mês", monthIncome - monthExpense]].map(([l, v]) => (
              <Card key={String(l)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{l}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{brl(Number(v))}</CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Chart title="Receitas x despesas por mês" data={chart} />
            <Chart
              title="Fluxo de caixa mensal"
              data={chart.map((x) => ({ ...x, fluxo: x.receitas - x.despesas }))}
              keys={["fluxo"]}
            />
            <PieBlock title="Despesas por categoria" data={expenseCategories} />
            <PieBlock title="Receitas por categoria" data={incomeCategories} />
            <PieBlock
              title="Contas a receber por status"
              data={byStatus(data.transactions, "income")}
            />
            <PieBlock
              title="Contas a pagar por status"
              data={byStatus(data.transactions, "expense")}
            />
          </div>
        </TabsContent>
        {[
          ["receivable", "income"],
          ["payable", "expense"],
          ["income", "income"],
          ["expense", "expense"],
        ].map(([v, t]) => (
          <TabsContent key={v} value={v}>
            <Filters
              {...{
                search,
                setSearch,
                status,
                setStatus,
                type,
                setType,
                category,
                setCategory,
                account,
                setAccount,
                from,
                setFrom,
                to,
                setTo,
                data,
              }}
            />
            <Transactions
              rows={rows.filter((x: any) => x.type === t)}
              data={data}
              paid={paid}
              editable={editable}
              page={page}
              setPage={setPage}
              payment={payment}
              role={role}
            />
          </TabsContent>
        ))}
        <TabsContent value="cashflow">
          <Chart
            title="Fluxo de caixa mensal"
            data={chart.map((x) => ({ ...x, fluxo: x.receitas - x.despesas }))}
            keys={["fluxo"]}
          />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesManager
            rows={data.categories as FinancialCategory[]}
            editable={editable}
            action={action}
          />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsManager
            rows={data.accounts as FinancialAccount[]}
            editable={editable}
            action={action}
          />
        </TabsContent>
        <TabsContent value="recurrences">
          <Recurrences data={data} editable={editable} action={action} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Filters(p: any) {
  return (
    <Card className="no-print mb-4">
      <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          aria-label="Buscar"
          placeholder="Buscar lançamento…"
          value={p.search}
          onChange={(e) => p.setSearch(e.target.value)}
        />
        <Select
          label="Status"
          value={p.status}
          set={p.setStatus}
          options={Object.entries(statusLabel)}
        />
        <Select
          label="Categoria"
          value={p.category}
          set={p.setCategory}
          options={p.data.categories.map((x: any) => [x.id, x.name])}
        />
        <Select
          label="Conta"
          value={p.account}
          set={p.setAccount}
          options={p.data.accounts.map((x: any) => [x.id, x.name])}
        />
        <Label>
          De
          <Input type="date" value={p.from} onChange={(e) => p.setFrom(e.target.value)} />
        </Label>
        <Label>
          Até
          <Input type="date" value={p.to} onChange={(e) => p.setTo(e.target.value)} />
        </Label>
      </CardContent>
    </Card>
  );
}
function Select({ label, value, set, options }: any) {
  return (
    <Label>
      {label}
      <select
        className={`${selectClass} w-full`}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="all">Todos</option>
        {options.map((x: any) => (
          <option key={x[0]} value={x[0]}>
            {x[1]}
          </option>
        ))}
      </select>
    </Label>
  );
}
function Transactions({ rows, data, paid, editable, page, setPage, payment, role }: any) {
  const shown = rows.slice(page * 10, page * 10 + 10);
  return (
    <Card>
      <CardContent className="pt-6">
        {!shown.length ? (
          <p className="py-10 text-center text-muted-foreground">Nenhum lançamento encontrado.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-muted/40">
                  {financeColumns.map((column) => (
                    <th
                      className={`border-b px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase ${column.className} ${column.align}`}
                      key={column.label}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((x: any) => {
                  const total = paid(x.id);
                  const status = displayedFinancialStatus(x.status, x.due_date);
                  return (
                    <tr className="align-top hover:bg-muted/30" key={x.id}>
                      <td className="border-b px-4 py-3 font-medium break-words">{x.description}</td>
                      <td className="border-b px-4 py-3 whitespace-nowrap">
                        {x.type === "income" ? "Receita" : "Despesa"}
                      </td>
                      <td className="border-b px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                        {brl(x.amount)}
                      </td>
                      <td className="border-b px-4 py-3 text-center tabular-nums whitespace-nowrap">
                        {brDate(x.due_date)}
                      </td>
                      <td className="border-b px-4 py-3 whitespace-nowrap">
                        <StatusBadge label={statusLabel[status]} tone={statusTone[status]} />
                      </td>
                      <td className="border-b px-4 py-3 break-words">
                        {data.categories.find((c: any) => c.id === x.category_id)?.name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="border-b px-4 py-3 break-words">
                        {data.accounts.find((a: any) => a.id === x.account_id)?.name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="border-b px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {brl(total)}
                      </td>
                      <td className="border-b px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {brl(x.amount - total)}
                      </td>
                      <td className="border-b px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {editable &&
                            !["paid", "cancelled"].includes(x.status) &&
                            !x.archived_at && (
                              <PayDialog
                                transaction={x}
                                accounts={data.accounts}
                                payments={data.payments.filter(
                                  (p: any) => p.transaction_id === x.id,
                                )}
                                payment={payment}
                              />
                            )}
                          <PaymentHistory
                            transaction={x}
                            payments={data.payments.filter((p: any) => p.transaction_id === x.id)}
                            accounts={data.accounts}
                            payment={payment}
                            canReverse={canReverseFinancialPayment(role)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="no-print mt-4 flex justify-between">
          <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span>Página {page + 1}</span>
          <Button
            variant="outline"
            disabled={(page + 1) * 10 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
function TransactionDialog({ data, onSave }: any) {
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [form, setForm] = useState({
      description: "",
      type: "income",
      amount: "",
      due_date: new Date().toISOString().slice(0, 10),
      category_id: "",
      account_id: "",
    });
  const categories = availableFinancialCategories(data.categories, form.type as FinancialType),
    accounts = availableFinancialAccounts(data.accounts);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Novo lançamento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>
            Descrição
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Label>
          <Select
            label="Tipo"
            value={form.type}
            set={(v: string) => setForm({ ...form, type: v, category_id: "" })}
            options={[
              ["income", "Receita"],
              ["expense", "Despesa"],
            ]}
          />
          <Label>
            Valor
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Label>
          <Label>
            Vencimento
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </Label>
          <Select
            label="Categoria"
            value={form.category_id || "all"}
            set={(v: string) => setForm({ ...form, category_id: v === "all" ? "" : v })}
            options={categories.map((x: any) => [x.id, x.name])}
          />
          <Select
            label="Conta"
            value={form.account_id || "all"}
            set={(v: string) => setForm({ ...form, account_id: v === "all" ? "" : v })}
            options={accounts.map((x: any) => [x.id, x.name])}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={saving || !form.description.trim() || Number(form.amount) <= 0}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  ...form,
                  amount: Number(form.amount),
                  category_id: form.category_id || null,
                  account_id: form.account_id || null,
                });
                setOpen(false);
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Não foi possível criar o lançamento.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function PayDialog({ transaction, accounts, payments, payment }: any) {
  const available = availableFinancialAccounts(accounts),
    [open, setOpen] = useState(false),
    paidTotal = payments
      .filter((p: any) => !p.reversed_at)
      .reduce((n: number, p: any) => n + Number(p.amount), 0),
    balance = Math.max(0, Number(transaction.amount) - paidTotal),
    [amount, setAmount] = useState(String(balance)),
    [accountId, setAccount] = useState(transaction.account_id || available[0]?.id || ""),
    [method, setMethod] = useState(""),
    [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <WalletCards />
          Pagar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-muted p-3 text-sm">
          <strong>{transaction.description}</strong>
          <br />
          Valor total: {brl(transaction.amount)} · Total já pago: {brl(paidTotal)} · Saldo restante:{" "}
          {brl(balance)}
        </div>
        <Label>
          Valor
          <Input
            type="number"
            min="0.01"
            max={balance}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Label>
        <Select
          label="Conta"
          value={accountId}
          set={setAccount}
          options={available.map((x: any) => [x.id, x.name])}
        />
        <Label>
          Forma de pagamento
          <Input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="PIX, boleto, cartão…"
          />
        </Label>
        <Label>
          Observação
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Label>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!accountId || payment.isPending || balance <= 0}
            onClick={async () => {
              await payment.mutateAsync({
                kind: "settle",
                transactionId: transaction.id,
                accountId,
                paymentMethod: method,
              });
              toast.success("Saldo quitado.");
              setOpen(false);
            }}
          >
            Quitar saldo
          </Button>
          <Button
            disabled={
              !accountId ||
              Number(amount) <= 0 ||
              Number(amount) > balance ||
              payment.isPending ||
              transaction.status === "paid" ||
              transaction.status === "cancelled" ||
              Boolean(transaction.archived_at)
            }
            onClick={async () => {
              await payment.mutateAsync({
                kind: "partial",
                transactionId: transaction.id,
                amount: Number(amount),
                accountId,
                paymentMethod: method,
                notes,
              });
              toast.success("Pagamento registrado.");
              setOpen(false);
            }}
          >
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentHistory({ transaction, payments, accounts, payment, canReverse }: any) {
  const [open, setOpen] = useState(false),
    confirmed = payments
      .filter((p: any) => !p.reversed_at)
      .reduce((n: number, p: any) => n + Number(p.amount), 0),
    reversed = payments
      .filter((p: any) => p.reversed_at)
      .reduce((n: number, p: any) => n + Number(p.amount), 0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <History />
          Ver pagamentos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de pagamentos</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          Valor original: {brl(transaction.amount)} · Total pago: {brl(confirmed)} · Total
          estornado: {brl(reversed)} · Saldo restante:{" "}
          {brl(Math.max(0, transaction.amount - confirmed))}
        </p>
        {!payments.length ? (
          <p>Nenhum pagamento registrado.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p: any) => (
              <div key={p.id} className="rounded-md border p-3 text-sm">
                <div className="flex justify-between">
                  <strong>
                    {brl(p.amount)} · {brDate(p.paid_at || p.created_at)}
                  </strong>
                  <span>{p.reversed_at ? "Estornado" : "Confirmado"}</span>
                </div>
                <p>
                  Conta: {accounts.find((a: any) => a.id === p.account_id)?.name ?? "—"} · Forma:{" "}
                  {p.payment_method || "—"}
                </p>
                <p>
                  Observação: {p.notes || "—"}
                  {p.reversed_at ? ` · Estornado em ${brDate(p.reversed_at)}` : ""}
                </p>
                {canReverse && !p.reversed_at && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={payment.isPending}
                    onClick={async () => {
                      if (
                        !window.confirm("O estorno desfará a movimentação financeira desta conta.")
                      )
                        return;
                      await payment.mutateAsync({
                        kind: "reverse",
                        paymentId: p.id,
                        notes: "Estorno confirmado pelo usuário",
                      });
                      toast.success("Pagamento estornado.");
                    }}
                  >
                    <Undo2 />
                    Estornar pagamento
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Recurrences({ data, editable, action }: any) {
  const generate = async () => {
    await action.mutateAsync({
      rpc: "generate_recurrence_transactions",
      payload: { until: new Date().toISOString().slice(0, 10) },
    });
    toast.success("Lançamentos pendentes gerados.");
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Lançamentos recorrentes</CardTitle>
        <div className="flex gap-2">
          {editable && (
            <>
              <RecurrenceDialog data={data} action={action} />
              <Button variant="outline" onClick={generate}>
                <RefreshCw />
                Gerar lançamentos pendentes
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!data.recurrences.length ? (
          <p>Nenhuma recorrência cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {data.recurrences.map((r: any) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <strong>{r.name}</strong>
                  <p className="text-sm text-muted-foreground">
                    {r.type === "income" ? "Receita" : "Despesa"} · {brl(r.amount)} ·{" "}
                    {
                      (
                        {
                          weekly: "Semanal",
                          monthly: "Mensal",
                          quarterly: "Trimestral",
                          yearly: "Anual",
                        } as any
                      )[r.frequency]
                    }{" "}
                    · Próxima: {brDate(r.next_run_date)} ·{" "}
                    {r.status === "active"
                      ? "Ativa"
                      : r.status === "paused"
                        ? "Pausada"
                        : "Finalizada"}
                  </p>
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <RecurrenceDialog data={data} action={action} recurrence={r} />
                    {r.status !== "finished" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await action.mutateAsync({
                            rpc: "update_financial_recurrence",
                            payload: {
                              id: r.id,
                              status: r.status === "active" ? "paused" : "active",
                            },
                          });
                          toast.success(
                            r.status === "active"
                              ? "Recorrência pausada."
                              : "Recorrência reativada.",
                          );
                        }}
                      >
                        {r.status === "active" ? "Pausar" : "Reativar"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecurrenceDialog({ data, action, recurrence }: any) {
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [form, setForm] = useState(() => ({
      name: recurrence?.name ?? "",
      type: recurrence?.type ?? "expense",
      amount: String(recurrence?.amount ?? ""),
      category_id: recurrence?.category_id ?? "",
      account_id: recurrence?.account_id ?? "",
      frequency: recurrence?.frequency ?? "monthly",
      interval_count: String(recurrence?.interval_count ?? 1),
      start_date: recurrence?.start_date ?? new Date().toISOString().slice(0, 10),
      end_date: recurrence?.end_date ?? "",
      next_run_date: recurrence?.next_run_date ?? new Date().toISOString().slice(0, 10),
      client_id: recurrence?.client_id ?? "",
      process_id: recurrence?.process_id ?? "",
      notes: recurrence?.notes ?? "",
    }));
  const field = (key: string, value: string) => setForm({ ...form, [key]: value });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={recurrence ? "sm" : "default"} variant={recurrence ? "outline" : "default"}>
          {recurrence ? (
            "Editar"
          ) : (
            <>
              <Plus />
              Nova recorrência
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recurrence ? "Editar recorrência" : "Nova recorrência"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="sm:col-span-2">
            Nome
            <Input value={form.name} onChange={(e) => field("name", e.target.value)} />
          </Label>
          <Select
            label="Tipo"
            value={form.type}
            set={(v: string) => field("type", v)}
            options={[
              ["income", "Receita"],
              ["expense", "Despesa"],
            ]}
          />
          <Label>
            Valor
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => field("amount", e.target.value)}
            />
          </Label>
          <Select
            label="Categoria"
            value={form.category_id || "all"}
            set={(v: string) => field("category_id", v === "all" ? "" : v)}
            options={availableFinancialCategories(data.categories, form.type as FinancialType).map(
              (x: any) => [x.id, x.name],
            )}
          />
          <Select
            label="Conta"
            value={form.account_id || "all"}
            set={(v: string) => field("account_id", v === "all" ? "" : v)}
            options={availableFinancialAccounts(data.accounts).map((x: any) => [x.id, x.name])}
          />
          <Select
            label="Frequência"
            value={form.frequency}
            set={(v: string) => field("frequency", v)}
            options={[
              ["weekly", "Semanal"],
              ["monthly", "Mensal"],
              ["quarterly", "Trimestral"],
              ["yearly", "Anual"],
            ]}
          />
          <Label>
            Intervalo
            <Input
              type="number"
              min="1"
              value={form.interval_count}
              onChange={(e) => field("interval_count", e.target.value)}
            />
          </Label>
          <Label>
            Data inicial
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => field("start_date", e.target.value)}
            />
          </Label>
          <Label>
            Data final (opcional)
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => field("end_date", e.target.value)}
            />
          </Label>
          <Label>
            Próxima execução
            <Input
              type="date"
              value={form.next_run_date}
              onChange={(e) => field("next_run_date", e.target.value)}
            />
          </Label>
          <Select
            label="Cliente (opcional)"
            value={form.client_id || "all"}
            set={(v: string) => field("client_id", v === "all" ? "" : v)}
            options={data.clients.map((x: any) => [x.id, x.name])}
          />
          <Select
            label="Processo (opcional)"
            value={form.process_id || "all"}
            set={(v: string) => field("process_id", v === "all" ? "" : v)}
            options={data.processes.map((x: any) => [x.id, `${x.code} — ${x.title}`])}
          />
          <Label className="sm:col-span-2">
            Observações
            <Input value={form.notes} onChange={(e) => field("notes", e.target.value)} />
          </Label>
        </div>
        <DialogFooter>
          <Button
            disabled={
              saving ||
              !form.name.trim() ||
              Number(form.amount) <= 0 ||
              Number(form.interval_count) < 1
            }
            onClick={async () => {
              setSaving(true);
              try {
                await action.mutateAsync({
                  rpc: recurrence ? "update_financial_recurrence" : "create_financial_recurrence",
                  payload: {
                    ...(recurrence ? { id: recurrence.id } : {}),
                    ...form,
                    amount: Number(form.amount),
                    interval_count: Number(form.interval_count),
                  },
                });
                toast.success(recurrence ? "Recorrência atualizada." : "Recorrência criada.");
                setOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
              } finally {
                setSaving(false);
              }
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Chart({ title, data, keys = ["receitas", "despesas"] }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data.length ? (
          <p className="flex h-56 items-center justify-center">Sem dados no período.</p>
        ) : (
          <div className="h-64" role="img" aria-label={title}>
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v: number) => brl(v)} />
                {keys.map((k: string, i: number) => (
                  <Bar key={k} dataKey={k} fill={colors[i]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function PieBlock({ title, data }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data.length ? (
          <p className="flex h-56 items-center justify-center">Sem dados no período.</p>
        ) : (
          <div className="h-64" role="img" aria-label={title}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" label>
                  {data.map((_: any, i: number) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => brl(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function SimpleList({ title, rows, empty, action }: any) {
  return (
    <Card>
      <CardHeader className="flex-row justify-between">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p>{empty}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((x: any) => (
              <li className="flex justify-between py-3" key={x.id}>
                <span>{x.name}</span>
                <span>{x.is_active === false ? "Inativo" : (x.status ?? "Ativo")}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
function monthly(rows: any[]) {
  const m = new Map<string, { month: string; receitas: number; despesas: number }>();
  rows
    .filter((x) => !x.archived_at && x.status !== "cancelled")
    .forEach((x) => {
      const key = x.due_date.slice(0, 7),
        v = m.get(key) ?? { month: key, receitas: 0, despesas: 0 };
      v[x.type === "income" ? "receitas" : "despesas"] += Number(x.amount);
      m.set(key, v);
    });
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
}
function byCategory(data: any, type: string) {
  if (!data) return [];
  const m = new Map<string, number>();
  data.transactions
    .filter((x: any) => x.type === type && !x.archived_at && x.status !== "cancelled")
    .forEach((x: any) => {
      const n = data.categories.find((c: any) => c.id === x.category_id)?.name ?? "Sem categoria";
      m.set(n, (m.get(n) ?? 0) + Number(x.amount));
    });
  return [...m].map(([name, value]) => ({ name, value }));
}
function byStatus(rows: any[], type: string) {
  const m = new Map<string, number>();
  rows
    .filter((x) => x.type === type && !x.archived_at)
    .forEach((x) =>
      m.set(statusLabel[x.status], (m.get(statusLabel[x.status]) ?? 0) + Number(x.amount)),
    );
  return [...m].map(([name, value]) => ({ name, value }));
}
