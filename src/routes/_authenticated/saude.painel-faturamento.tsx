import { useMemo, useState } from "react";
import { useHealthPermissions } from "@/hooks/use-health-permissions";
import { HealthSectionState } from "@/components/health/health-section-state";
import {
  summarizeHealthBillingDashboard,
  type HealthBillingPeriod,
} from "@/lib/health-billing-dashboard";
import { localCivilDate } from "@/lib/health-clinic-dashboard";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  RefreshCw,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

type PeriodKey = HealthBillingPeriod;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function HealthBillingDashboardPage() {
  const { organizationId } = useWorkspace();
  const { canViewBilling, canViewDenials } = useHealthPermissions();
  const [period, setPeriod] = useState<PeriodKey>("90d");
  const today = localCivilDate();
  const batches = useHealthBillingBatches(organizationId, "", canViewBilling);
  const denials = useHealthDenials(organizationId, "", canViewBilling && canViewDenials);
  const metrics = useMemo(
    () =>
      summarizeHealthBillingDashboard(
        canViewBilling ? (batches.data ?? []) : [],
        canViewBilling && canViewDenials ? (denials.data ?? []) : [],
        period,
        today,
      ),
    [batches.data, denials.data, period, today, canViewBilling, canViewDenials],
  );
  const byInsurer = metrics.byInsurer;

  const chartData = byInsurer.slice(0, 8).map((row) => ({
    name: row.name.length > 18 ? `${row.name.slice(0, 18)}…` : row.name,
    Faturado: row.billed,
    Recebido: row.received,
    Pendente: row.pending,
  }));

  if (!canViewBilling)
    return (
      <p role="alert" className="p-6">
        O faturamento não está disponível para este acesso.
      </p>
    );

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
              Visão gerencial dos lotes faturados por convênio: recebimentos, glosas, recuperação e
              atrasos. Rascunhos e cancelados ficam fora dos totais. Contas particulares são
              acompanhadas em Contas Médicas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["30d", "30 dias"],
                ["90d", "90 dias"],
                ["year", "Este ano"],
                ["all", "Todo período"],
              ] as [PeriodKey, string][]
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={period === value ? "secondary" : "outline"}
                className={
                  period === value ? "" : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                }
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
                if (canViewDenials) void denials.refetch();
              }}
            >
              <RefreshCw className="size-4" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <HealthSectionState
        label="os lotes de faturamento"
        loading={batches.isLoading}
        error={batches.isError}
        onRetry={() => void batches.refetch()}
      >
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Faturado" value={money(metrics.billed)} icon={WalletCards} />
            <MetricCard label="Recebido" value={money(metrics.received)} icon={TrendingUp} />
            <MetricCard label="Pendente" value={money(metrics.pending)} icon={CalendarClock} />
            {canViewDenials && denials.isSuccess && (
              <>
                <MetricCard label="Glosado" value={money(metrics.denied)} icon={AlertTriangle} />
                <MetricCard label="Recuperado" value={money(metrics.recovered)} icon={RefreshCw} />
              </>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <RateCard label="Taxa de recebimento" value={percent(metrics.receiptRate)} />
            {canViewDenials && denials.isSuccess && (
              <>
                <RateCard label="Taxa de glosa" value={percent(metrics.denialRate)} />
                <RateCard label="Taxa de recuperação" value={percent(metrics.recoveryRate)} />
              </>
            )}
          </div>

          {canViewDenials && (
            <HealthSectionState
              label="as glosas"
              loading={denials.isLoading}
              error={denials.isError}
              onRetry={() => void denials.refetch()}
            >
              {null}
            </HealthSectionState>
          )}

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
                          ? new Date(`${batch.expected_payment_at}T12:00:00`).toLocaleDateString(
                              "pt-BR",
                            )
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
                      <Bar
                        dataKey="Faturado"
                        fill="currentColor"
                        className="text-blue-500"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="Recebido"
                        fill="currentColor"
                        className="text-emerald-500"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="Pendente"
                        fill="currentColor"
                        className="text-amber-500"
                        radius={[4, 4, 0, 0]}
                      />
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
                        <TableRow key={row.id}>
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
      </HealthSectionState>
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
