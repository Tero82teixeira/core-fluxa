import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Loader2,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkspace } from "@/lib/workspace";
import { useHealthBillingBatches } from "@/hooks/use-health-billing-batches";
import { useHealthDenials } from "@/hooks/use-health-denials";

export const Route = createFileRoute("/_authenticated/saude/painel-faturamento")({
  head: () => ({
    meta: [
      { title: "Painel de Faturamento — FLUXA Saúde" },
      {
        name: "description",
        content: "Indicadores gerenciais de faturamento médico por convênio e período.",
      },
    ],
  }),
  component: HealthBillingDashboardPage,
});

type PeriodKey = "30d" | "90d" | "year" | "all";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function dateInPeriod(value: string | null | undefined, period: PeriodKey) {
  if (period === "all") return true;
  if (!value) return false;

  const date = new Date(`${value}T12:00:00`);
  const now = new Date();

  if (period === "year") return date.getFullYear() === now.getFullYear();

  const days = period === "30d" ? 30 : 90;
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() - days);
  return date >= threshold;
}

function HealthBillingDashboardPage() {
  const { organizationId } = useWorkspace();
  const [period, setPeriod] = useState<PeriodKey>("90d");
  const batches = useHealthBillingBatches(organizationId, "");
  const denials = useHealthDenials(organizationId, "");

  const filteredBatches = useMemo(
    () =>
      (batches.data ?? []).filter((batch) =>
        dateInPeriod(batch.submitted_at ?? batch.created_at, period),
      ),
    [batches.data, period],
  );

  const filteredDenials = useMemo(
    () =>
      (denials.data ?? []).filter((denial) =>
        dateInPeriod(denial.received_at ?? denial.created_at, period),
      ),
    [denials.data, period],
  );

  const metrics = useMemo(() => {
    const billed = filteredBatches.reduce(
      (sum, batch) => sum + Number(batch.total_amount || 0),
      0,
    );
    const received = filteredBatches.reduce(
      (sum, batch) => sum + Number(batch.paid_amount || 0),
      0,
    );
    const denied = filteredDenials.reduce(
      (sum, denial) => sum + Number(denial.denied_amount || 0),
      0,
    );
    const recovered = filteredDenials.reduce(
      (sum, denial) => sum + Number(denial.recovered_amount || 0),
      0,
    );
    const pending = filteredBatches.reduce(
      (sum, batch) => sum + Number(batch.pending_amount || 0),
      0,
    );

    const today = new Date().toISOString().slice(0, 10);
    const overdue = filteredBatches.filter(
      (batch) =>
        batch.expected_payment_at &&
        batch.expected_payment_at < today &&
        Number(batch.pending_amount || 0) > 0 &&
        !["pago", "cancelado"].includes(batch.status),
    );

    return {
      billed,
      received,
      denied,
      recovered,
      pending,
      overdue,
      receiptRate: billed > 0 ? received / billed : 0,
      denialRate: billed > 0 ? denied / billed : 0,
      recoveryRate: denied > 0 ? recovered / denied : 0,
    };
  }, [filteredBatches, filteredDenials]);

  const byInsurer = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        billed: number;
        received: number;
        denied: number;
        pending: number;
        batches: number;
      }
    >();

    for (const batch of filteredBatches) {
      const key = batch.insurer_id;
      const current = map.get(key) ?? {
        name: batch.insurer_name || "Convênio",
        billed: 0,
        received: 0,
        denied: 0,
        pending: 0,
        batches: 0,
      };
      current.billed += Number(batch.total_amount || 0);
      current.received += Number(batch.paid_amount || 0);
      current.pending += Number(batch.pending_amount || 0);
      current.batches += 1;
      map.set(key, current);
    }

    for (const denial of filteredDenials) {
      const name = denial.insurer_name || "Sem convênio";
      const currentEntry = [...map.entries()].find(([, value]) => value.name === name);
      if (currentEntry) {
        currentEntry[1].denied += Math.max(
          0,
          Number(denial.denied_amount || 0) - Number(denial.recovered_amount || 0),
        );
      }
    }

    return [...map.values()].sort((a, b) => b.billed - a.billed);
  }, [filteredBatches, filteredDenials]);

  const chartData = byInsurer.slice(0, 8).map((row) => ({
    name: row.name.length > 18 ? `${row.name.slice(0, 18)}…` : row.name,
    Faturado: row.billed,
    Recebido: row.received,
    Pendente: row.pending,
  }));

  const isLoading = batches.isLoading || denials.isLoading;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-blue-400 text-slate-950">
                <BarChart3 className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-blue-300 uppercase">
                  FLUXA Saúde
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Painel de Faturamento
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Visão gerencial de faturamento, recebimentos, glosas, recuperação e atrasos por convênio.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              ["30d", "30 dias"],
              ["90d", "90 dias"],
              ["year", "Este ano"],
              ["all", "Todo período"],
            ] as [PeriodKey, string][]).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={period === value ? "secondary" : "outline"}
                className={period === value ? "" : "border-white/20 bg-white/5 text-white hover:bg-white/10"}
                onClick={() => setPeriod(value)}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              onClick={() => {
                void batches.refetch();
                void denials.refetch();
              }}
            >
              <RefreshCw className="size-4" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando indicadores…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Faturado" value={money(metrics.billed)} icon={WalletCards} />
            <MetricCard label="Recebido" value={money(metrics.received)} icon={TrendingUp} />
            <MetricCard label="Pendente" value={money(metrics.pending)} icon={CalendarClock} />
            <MetricCard label="Glosado" value={money(metrics.denied)} icon={AlertTriangle} />
            <MetricCard label="Recuperado" value={money(metrics.recovered)} icon={RefreshCw} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <RateCard label="Taxa de recebimento" value={percent(metrics.receiptRate)} />
            <RateCard label="Taxa de glosa" value={percent(metrics.denialRate)} />
            <RateCard label="Taxa de recuperação" value={percent(metrics.recoveryRate)} />
          </div>

          {metrics.overdue.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/[0.04]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-amber-600" />
                  Lotes com pagamento previsto em atraso
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.overdue.slice(0, 8).map((batch) => (
                  <div
                    key={batch.id}
                    className="flex flex-col justify-between gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-medium">
                        {batch.insurer_name || "Convênio"} · {batch.reference_period}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Previsto para{" "}
                        {batch.expected_payment_at
                          ? new Date(`${batch.expected_payment_at}T12:00:00`).toLocaleDateString("pt-BR")
                          : "—"}
                      </p>
                    </div>
                    <p className="font-semibold">{money(Number(batch.pending_amount || 0))}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Faturamento por convênio</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                {chartData.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    Sem dados no período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip formatter={(value) => money(Number(value))} />
                      <Bar dataKey="Faturado" fill="currentColor" className="text-blue-500" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Recebido" fill="currentColor" className="text-emerald-500" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pendente" fill="currentColor" className="text-amber-500" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo por convênio</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Convênio</TableHead>
                        <TableHead className="text-right">Faturado</TableHead>
                        <TableHead className="text-right">Pendente</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byInsurer.map((row) => (
                        <TableRow key={row.name}>
                          <TableCell>
                            <div className="font-medium">{row.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.batches} {row.batches === 1 ? "lote" : "lotes"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{money(row.billed)}</TableCell>
                          <TableCell className="text-right">{money(row.pending)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof WalletCards;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-muted">
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function RateCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
