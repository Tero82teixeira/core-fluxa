import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Ban,
  Download,
  History,
  Pencil,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
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
  matchesDisplayedFinancialStatus,
  monthlyCashFlow,
  type FinancialAccount,
  type FinancialCategory,
  type FinancialStatus,
  type FinancialType,
} from "@/lib/finance";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Tone } from "@/lib/domain";
import { describeError } from "@/lib/errors";
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
const statusTone: Record<string, Tone> = {
  pending: "info",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  cancelled: "neutral",
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
    [status, setStatus] = useState<FinancialStatus | "all">("all"),
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
          matchesDisplayedFinancialStatus(x.status, x.due_date, status) &&
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
    cashFlowChart = monthlyCashFlow(data?.transactions ?? [], data?.payments ?? []),
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
            <Chart title="Fluxo de caixa mensal" data={cashFlowChart} keys={["fluxo"]} />
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
              action={action}
              role={role}
            />
          </TabsContent>
        ))}
        <TabsContent value="cashflow">
          <Chart title="Fluxo de caixa mensal" data={cashFlowChart} keys={["fluxo"]} />
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
function Transactions({ rows, data, paid, editable, page, setPage, payment, action, role }: any) {
  const shown = rows.slice(page * 10, page * 10 + 10);
  const categoryName = (transaction: any) =>
    data.categories.find((category: any) => category.id === transaction.category_id)?.name;
  const accountName = (transaction: any) =>
    data.accounts.find((account: any) => account.id === transaction.account_id)?.name;
  return (
    <Card>
      <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
        {!shown.length ? (
          <p className="py-10 text-center text-muted-foreground">Nenhum lançamento encontrado.</p>
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {shown.map((transaction: any) => {
                const total = paid(transaction.id);
                const currentStatus = displayedFinancialStatus(
                  transaction.status,
                  transaction.due_date,
                );
                return (
                  <article className="rounded-lg border p-3" key={transaction.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-medium break-words">{transaction.description}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {transaction.type === "income" ? "Receita" : "Despesa"} · Vence em{" "}
                          {brDate(transaction.due_date)}
                        </p>
                      </div>
                      <StatusBadge
                        label={statusLabel[currentStatus]}
                        tone={statusTone[currentStatus]}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className="block text-xs text-muted-foreground">Valor</span>
                        <strong className="tabular-nums">{brl(transaction.amount)}</strong>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">Saldo restante</span>
                        <strong className="tabular-nums">{brl(transaction.amount - total)}</strong>
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs text-muted-foreground">Categoria</span>
                        <span className="block truncate">{categoryName(transaction) ?? "—"}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs text-muted-foreground">Conta</span>
                        <span className="block truncate">{accountName(transaction) ?? "—"}</span>
                      </div>
                    </div>
                    <TransactionActions
                      transaction={transaction}
                      data={data}
                      editable={editable}
                      payment={payment}
                      action={action}
                      role={role}
                      className="mt-3 border-t pt-3"
                    />
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="w-[30%] border-b px-2 py-2 text-left text-xs font-semibold uppercase">
                      Lançamento
                    </th>
                    <th className="w-[13%] border-b px-2 py-2 text-right text-xs font-semibold uppercase">
                      Valor
                    </th>
                    <th className="w-[13%] border-b px-2 py-2 text-center text-xs font-semibold uppercase">
                      Vencimento
                    </th>
                    <th className="w-[13%] border-b px-2 py-2 text-left text-xs font-semibold uppercase">
                      Status
                    </th>
                    <th className="w-[15%] border-b px-2 py-2 text-right text-xs font-semibold uppercase">
                      Pagamento
                    </th>
                    <th className="w-[16%] border-b px-2 py-2 text-right text-xs font-semibold uppercase">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((x: any) => {
                    const total = paid(x.id);
                    const status = displayedFinancialStatus(x.status, x.due_date);
                    return (
                      <tr className="align-top hover:bg-muted/30" key={x.id}>
                        <td className="border-b px-2 py-3 align-middle">
                          <span className="font-medium break-words">{x.description}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {x.type === "income" ? "Receita" : "Despesa"} ·{" "}
                            {categoryName(x) ?? "Sem categoria"} · {accountName(x) ?? "Sem conta"}
                          </span>
                        </td>
                        <td className="border-b px-2 py-3 text-right font-medium tabular-nums whitespace-nowrap">
                          {brl(x.amount)}
                        </td>
                        <td className="border-b px-2 py-3 text-center tabular-nums whitespace-nowrap">
                          {brDate(x.due_date)}
                        </td>
                        <td className="border-b px-2 py-3 whitespace-nowrap">
                          <StatusBadge label={statusLabel[status]} tone={statusTone[status]} />
                        </td>
                        <td className="border-b px-2 py-3 text-right text-xs tabular-nums whitespace-nowrap">
                          <span className="block">Pago {brl(total)}</span>
                          <span className="block text-muted-foreground">
                            Saldo {brl(x.amount - total)}
                          </span>
                        </td>
                        <td className="border-b px-2 py-3">
                          <TransactionActions
                            transaction={x}
                            data={data}
                            editable={editable}
                            payment={payment}
                            action={action}
                            role={role}
                            stacked
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
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
function TransactionActions({
  transaction,
  data,
  editable,
  payment,
  action,
  role,
  className = "",
  stacked = false,
}: any) {
  const transactionPayments = data.payments.filter(
    (item: any) => item.transaction_id === transaction.id,
  );
  const paidTotal = transactionPayments
    .filter((item: any) => !item.reversed_at)
    .reduce((total: number, item: any) => total + Number(item.amount), 0);
  const open = !["paid", "cancelled"].includes(transaction.status);
  const runLifecycleAction = async (rpc: string, successMessage: string) => {
    try {
      await action.mutateAsync({ rpc, payload: { id: transaction.id } });
      toast.success(successMessage);
    } catch (error) {
      toast.error(describeError(error));
    }
  };
  return (
    <div
      className={`flex ${stacked ? "flex-col items-stretch" : "flex-wrap items-center"} justify-end gap-1 ${className}`}
    >
      {editable && open && !transaction.archived_at && (
        <>
            <TransactionDialog
              data={data}
              transaction={transaction}
              paidTotal={paidTotal}
              onSave={async (payload: Record<string, unknown>) => {
                await action.mutateAsync({
                  rpc: "update_financial_transaction",
                  payload: { id: transaction.id, ...payload },
                });
                toast.success("Lançamento atualizado.");
              }}
            />
            <PayDialog
              transaction={transaction}
              accounts={data.accounts}
              payments={transactionPayments}
              payment={payment}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isPending || paidTotal > 0}
                  title={paidTotal > 0 ? "Estorne os pagamentos antes de cancelar." : undefined}
                >
                  <Ban />
                  Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar este lançamento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    “{transaction.description}” permanecerá no histórico e poderá ser arquivado
                    depois. Esta ação não registra nenhum pagamento.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={action.isPending}
                    onClick={() =>
                      runLifecycleAction(
                        "cancel_financial_transaction",
                        "Lançamento cancelado.",
                      )
                    }
                  >
                    Confirmar cancelamento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </>
      )}
      {editable &&
        ["paid", "cancelled"].includes(transaction.status) &&
        !transaction.archived_at && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={action.isPending}>
                <Archive />
                Arquivar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arquivar este lançamento?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{transaction.description}” será removido das visões ativas. O histórico
                  financeiro e a auditoria serão preservados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={action.isPending}
                  onClick={() =>
                    runLifecycleAction(
                      "archive_financial_transaction",
                      "Lançamento arquivado.",
                    )
                  }
                >
                  Confirmar arquivamento
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      <PaymentHistory
        transaction={transaction}
        payments={transactionPayments}
        accounts={data.accounts}
        payment={payment}
        canReverse={canReverseFinancialPayment(role)}
      />
    </div>
  );
}
function transactionForm(transaction?: any) {
  return {
    description: transaction?.description ?? "",
    type: transaction?.type ?? "income",
    amount: transaction ? String(transaction.amount) : "",
    due_date: transaction?.due_date ?? new Date().toISOString().slice(0, 10),
    category_id: transaction?.category_id ?? "",
    account_id: transaction?.account_id ?? "",
    notes: transaction?.notes ?? "",
  };
}

function TransactionDialog({ data, onSave, transaction, paidTotal = 0 }: any) {
  const editing = Boolean(transaction);
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [form, setForm] = useState(() => transactionForm(transaction));
  const availableCategories = availableFinancialCategories(
      data.categories,
      form.type as FinancialType,
    ),
    currentCategory = data.categories.find((item: any) => item.id === form.category_id),
    categories =
      currentCategory && !availableCategories.some((item: any) => item.id === currentCategory.id)
        ? [...availableCategories, currentCategory]
        : availableCategories,
    availableAccounts = availableFinancialAccounts(data.accounts),
    currentAccount = data.accounts.find((item: any) => item.id === form.account_id),
    accounts =
      currentAccount && !availableAccounts.some((item: any) => item.id === currentAccount.id)
        ? [...availableAccounts, currentAccount]
        : availableAccounts,
    amount = Number(form.amount),
    invalidAmount = amount <= 0 || (editing && amount < paidTotal);
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setForm(transactionForm(transaction));
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button size="sm" variant="outline">
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button>
            <Plus />
            Novo lançamento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>
            Descrição
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Label>
          {editing ? (
            <Label>
              Tipo
              <Input value={form.type === "income" ? "Receita" : "Despesa"} disabled />
            </Label>
          ) : (
            <Select
              label="Tipo"
              value={form.type}
              set={(v: string) => setForm({ ...form, type: v, category_id: "" })}
              options={[
                ["income", "Receita"],
                ["expense", "Despesa"],
              ]}
            />
          )}
          <Label>
            Valor
            <Input
              type="number"
              min={editing ? Math.max(0.01, paidTotal) : 0.01}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            {editing && paidTotal > 0 && (
              <span className="mt-1 block text-xs text-muted-foreground">
                O valor não pode ser menor que o total já pago de {brl(paidTotal)}.
              </span>
            )}
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
          <Label>
            Observações
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </Label>
        </div>
        <DialogFooter>
          <Button
            disabled={saving || !form.description.trim() || !form.due_date || invalidAmount}
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
                toast.error(describeError(error));
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
  const recurrences = data.recurrences.filter((recurrence: any) => !recurrence.archived_at);
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
        <div>
          <CardTitle>Lançamentos recorrentes</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Recorrências ativas são geradas automaticamente pelo relógio a cada 15
            minutos.
          </p>
        </div>
        <div className="flex gap-2">
          {editable && (
            <>
              <RecurrenceDialog data={data} action={action} />
              <Button variant="outline" onClick={generate}>
                <RefreshCw />
                Gerar pendentes agora
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!recurrences.length ? (
          <p>Nenhuma recorrência cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {recurrences.map((r: any) => (
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
