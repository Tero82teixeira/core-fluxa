import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  ArchiveRestore,
  Building2,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  CreditCard,
  HandCoins,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { COMMERCIAL_STATUS_LABEL, type EffectiveCommercialStatus } from "@/lib/commercial-trial";
import { describeError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { brl } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { subscriptionStatusLabel } from "@/lib/billing";
import {
  kiwifyDiagnosticLabel,
  kiwifyEventHealthSummary,
  kiwifyEventTypeLabel,
  type KiwifyEventOutcome,
} from "@/lib/kiwify-health";
import {
  canArchivePlatformOrganization,
  matchesPlatformSubscriptionFilter,
  platformBillingMetrics,
  type PlatformSubscriptionFilter,
} from "@/lib/platform-billing";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/administracao-plataforma")({
  head: () => ({
    meta: [
      { title: "Administração da plataforma — FLUXA" },
      { name: "description", content: "Controle comercial de empresas e períodos de teste." },
    ],
  }),
  component: PlatformAdministration,
});

type PlatformOrganization = {
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  owner_name: string | null;
  owner_email: string | null;
  commercial_status: "trial" | "active" | "suspended";
  effective_status: EffectiveCommercialStatus;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  days_remaining: number | null;
  onboarding_completed: boolean;
  created_at: string;
  archived_at: string | null;
};

type PlatformSubscription = Pick<
  Tables<"organization_subscriptions">,
  | "organization_id"
  | "status"
  | "billing_email"
  | "access_until"
  | "next_payment_at"
  | "last_event_at"
>;

type PlatformKiwifyEvent = {
  event_key: string;
  organization_id: string | null;
  organization_name: string | null;
  event_type: string;
  received_at: string;
  processed_at: string | null;
  outcome: KiwifyEventOutcome;
  diagnostic_code: string | null;
};

const statusTone: Record<EffectiveCommercialStatus, string> = {
  trial: "border-info/30 bg-info/10 text-info",
  active: "border-success/30 bg-success/10 text-success",
  suspended: "border-warning/30 bg-warning/10 text-warning",
  expired: "border-destructive/30 bg-destructive/10 text-destructive",
};

function usePlatformOrganizations(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_organizations");
      if (error) throw error;
      return (data ?? []) as PlatformOrganization[];
    },
  });
}

function usePlatformSubscriptions(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select(
          "organization_id, status, billing_email, access_until, next_payment_at, last_event_at",
        );
      if (error) throw error;
      return (data ?? []) as PlatformSubscription[];
    },
  });
}

function usePlatformKiwifyEvents(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-kiwify-event-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_kiwify_event_health", {
        _limit: 20,
      });
      if (error) throw error;
      return (data ?? []) as PlatformKiwifyEvent[];
    },
  });
}

function PlatformAdministration() {
  const { platformAdmin } = useWorkspace();
  const queryClient = useQueryClient();
  const organizations = usePlatformOrganizations(platformAdmin);
  const subscriptions = usePlatformSubscriptions(platformAdmin);
  const kiwifyEvents = usePlatformKiwifyEvents(platformAdmin);
  const [search, setSearch] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState<PlatformSubscriptionFilter>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<PlatformOrganization | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PlatformOrganization | null>(null);

  const update = useMutation({
    mutationFn: async ({
      organizationId,
      action,
      days,
    }: {
      organizationId: string;
      action: string;
      days?: number;
    }) => {
      const { error } = await supabase.rpc("update_organization_commercial_status", {
        _organization_id: organizationId,
        _action: action,
        ...(days === undefined ? {} : { _days: days }),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] }),
      ]);
      toast.success("Situação comercial atualizada.");
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const archive = useMutation({
    mutationFn: async ({
      organizationId,
      archived,
    }: {
      organizationId: string;
      archived: boolean;
    }) => {
      const { error } = await supabase.rpc("set_platform_organization_archived", {
        _organization_id: organizationId,
        _archived: archived,
      });
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-subscriptions"] }),
      ]);
      toast.success(variables.archived ? "Empresa arquivada." : "Empresa restaurada.");
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const rows = organizations.data ?? [];
  const subscriptionRows = subscriptions.data ?? [];
  const subscriptionsByOrganization = useMemo(
    () =>
      new Map(subscriptionRows.map((subscription) => [subscription.organization_id, subscription])),
    [subscriptionRows],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((organization) => {
      if (organization.archived_at && !includeArchived) return false;
      const subscription = subscriptionsByOrganization.get(organization.organization_id);
      const matchesSearch =
        !term ||
        [
          organization.trade_name,
          organization.legal_name,
          organization.owner_name,
          organization.owner_email,
          subscription?.billing_email,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
      return (
        matchesSearch &&
        matchesPlatformSubscriptionFilter(
          subscription?.status ?? null,
          subscriptionFilter,
          organization.effective_status,
        )
      );
    });
  }, [rows, search, subscriptionFilter, subscriptionsByOrganization, includeArchived]);

  if (!platformAdmin) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <ShieldAlert className="mx-auto size-8 text-destructive" aria-hidden />
            <h1 className="font-display text-xl font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground">
              Esta área está disponível somente para a administração da plataforma FLUXA.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeRows = rows.filter((row) => !row.archived_at);
  const billing = platformBillingMetrics(activeRows, subscriptionRows);
  const summary = {
    total: activeRows.length,
    trial: activeRows.filter((row) => row.effective_status === "trial").length,
    ...billing,
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="page-title">Administração da plataforma</h1>
        <p className="page-subtitle">
          Acompanhe empresas em avaliação, ative contratos, estenda testes ou suspenda acessos.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Empresas ativas" value={summary.total} icon={Building2} />
        <SummaryCard label="Em teste" value={summary.trial} icon={Clock3} />
        <SummaryCard
          label="Assinaturas ativas"
          value={summary.activeSubscriptions}
          icon={CheckCircle2}
        />
        <SummaryCard
          label="Atenção comercial"
          value={summary.attentionOrganizations}
          icon={ShieldAlert}
        />
        <SummaryCard
          label="Receita mensal contratada"
          value={brl(summary.monthlyRecurringRevenue)}
          icon={HandCoins}
        />
      </div>

      <KiwifyEventHealthPanel query={kiwifyEvents} />

      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Empresas cadastradas</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} empresa(s) encontrada(s).
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,22rem)_13rem_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar empresa, responsável ou cobrança…"
              aria-label="Buscar empresas"
            />
            <Select
              value={subscriptionFilter}
              onValueChange={(value) => setSubscriptionFilter(value as PlatformSubscriptionFilter)}
            >
              <SelectTrigger aria-label="Filtrar por assinatura">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as assinaturas</SelectItem>
                <SelectItem value="active">Assinaturas ativas</SelectItem>
                <SelectItem value="pending">Aguardando pagamento</SelectItem>
                <SelectItem value="attention">Precisam de atenção</SelectItem>
                <SelectItem value="not_started">Checkout não iniciado</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              aria-pressed={includeArchived}
              onClick={() => setIncludeArchived((current) => !current)}
            >
              <Archive className="size-4" aria-hidden />
              {includeArchived ? "Ocultar arquivadas" : "Incluir arquivadas"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(organizations.isLoading || subscriptions.isLoading) && (
            <p className="p-6 text-sm text-muted-foreground">Carregando painel comercial…</p>
          )}
          {(organizations.isError || subscriptions.isError) && (
            <p className="p-6 text-sm text-destructive">
              {describeError(organizations.error ?? subscriptions.error)}
            </p>
          )}
          {!organizations.isLoading &&
            !subscriptions.isLoading &&
            !organizations.isError &&
            !subscriptions.isError &&
            filtered.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
            )}
          {filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Empresa</th>
                    <th className="px-4 py-3 font-medium">Responsável</th>
                    <th className="px-4 py-3 font-medium">Situação</th>
                    <th className="px-4 py-3 font-medium">Assinatura Kiwify</th>
                    <th className="px-4 py-3 font-medium">Próxima cobrança</th>
                    <th className="px-4 py-3 font-medium">Teste</th>
                    <th className="px-4 py-3 font-medium">Entrada</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((organization) => (
                    <tr
                      key={organization.organization_id}
                      className={cn(
                        "border-b last:border-0",
                        organization.archived_at && "bg-muted/25 text-muted-foreground",
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {organization.trade_name || organization.legal_name}
                        </p>
                        {organization.trade_name && (
                          <p className="text-xs text-muted-foreground">{organization.legal_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p>{organization.owner_name || "Não informado"}</p>
                        <p className="text-xs text-muted-foreground">
                          {organization.owner_email || "Sem e-mail"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {organization.archived_at ? (
                          <>
                            <Badge variant="outline" className="border-slate-300 bg-slate-100">
                              Arquivada
                            </Badge>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Em {formatDate(organization.archived_at)}
                            </p>
                          </>
                        ) : (
                          <>
                            <Badge
                              variant="outline"
                              className={statusTone[organization.effective_status]}
                            >
                              {COMMERCIAL_STATUS_LABEL[organization.effective_status]}
                            </Badge>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {organization.onboarding_completed
                                ? "Configuração concluída"
                                : "Configuração pendente"}
                            </p>
                          </>
                        )}
                      </td>
                      <SubscriptionStatusCell
                        subscription={subscriptionsByOrganization.get(organization.organization_id)}
                      />
                      <SubscriptionChargeCell
                        subscription={subscriptionsByOrganization.get(organization.organization_id)}
                      />
                      <td className="px-4 py-3">
                        {organization.trial_ends_at ? (
                          <>
                            <p>{formatDate(organization.trial_ends_at)}</p>
                            <p className="text-xs text-muted-foreground">
                              {organization.effective_status === "expired"
                                ? "Prazo encerrado"
                                : `${organization.days_remaining ?? 0} dia(s) restante(s)`}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sem prazo</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{formatDate(organization.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <CommercialActions
                          organization={organization}
                          subscription={subscriptionsByOrganization.get(
                            organization.organization_id,
                          )}
                          pending={update.isPending || archive.isPending}
                          onActivate={() =>
                            update.mutate({
                              organizationId: organization.organization_id,
                              action: "activate",
                            })
                          }
                          onExtend={(days) =>
                            update.mutate({
                              organizationId: organization.organization_id,
                              action: "extend_trial",
                              days,
                            })
                          }
                          onSuspend={() => setSuspendTarget(organization)}
                          onArchive={() => setArchiveTarget(organization)}
                          onRestore={() =>
                            archive.mutate({
                              organizationId: organization.organization_id,
                              archived: false,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(suspendTarget)}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspender acesso da empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados serão preservados, mas todos os usuários da empresa ficarão sem acesso aos
              módulos até uma nova ativação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!suspendTarget) return;
                update.mutate({ organizationId: suspendTarget.organization_id, action: "suspend" });
                setSuspendTarget(null);
              }}
            >
              Confirmar suspensão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar esta empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              A empresa sairá da lista principal e perderá o acesso aos módulos. Nenhum cliente,
              processo, documento ou histórico será apagado, e você poderá restaurá-la depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!archiveTarget) return;
                archive.mutate({
                  organizationId: archiveTarget.organization_id,
                  archived: true,
                });
                setArchiveTarget(null);
              }}
            >
              Confirmar arquivamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const subscriptionTone: Record<string, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  pending:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  past_due:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
  canceled:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  refunded:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
  chargeback:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
};

const eventOutcomeLabel: Record<KiwifyEventOutcome, string> = {
  processed: "Processado",
  ignored: "Ignorado com segurança",
  attention: "Precisa de atenção",
};

const eventOutcomeTone: Record<KiwifyEventOutcome, string> = {
  processed:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
  ignored:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
  attention:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
};

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function KiwifyEventHealthPanel({ query }: { query: ReturnType<typeof usePlatformKiwifyEvents> }) {
  const events = query.data ?? [];
  const summary = kiwifyEventHealthSummary(events);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-brand" aria-hidden />
            Saúde dos pagamentos Kiwify
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos eventos recebidos pelo FLUXA, sem expor dados pessoais do comprador.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} aria-hidden />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline" className={eventOutcomeTone.processed}>
            {summary.processed} processado(s)
          </Badge>
          <Badge variant="outline" className={eventOutcomeTone.ignored}>
            {summary.ignored} ignorado(s) com segurança
          </Badge>
          <Badge variant="outline" className={eventOutcomeTone.attention}>
            {summary.attention} para verificar
          </Badge>
        </div>

        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando eventos de pagamento…</p>
        )}
        {query.isError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Não foi possível consultar os eventos da Kiwify. Atualize a página em alguns instantes.
          </p>
        )}
        {!query.isLoading && !query.isError && events.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum evento de pagamento foi recebido ainda.
          </p>
        )}
        {events.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Resultado</th>
                  <th className="px-3 py-2.5 font-medium">Empresa</th>
                  <th className="px-3 py-2.5 font-medium">Evento</th>
                  <th className="px-3 py-2.5 font-medium">Recebido em</th>
                  <th className="px-3 py-2.5 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.event_key} className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={eventOutcomeTone[event.outcome]}>
                        {eventOutcomeLabel[event.outcome]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-medium">
                      {event.organization_name ?? "Empresa não identificada"}
                    </td>
                    <td className="px-3 py-3">{kiwifyEventTypeLabel(event.event_type)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatEventDate(event.received_at)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {kiwifyDiagnosticLabel(event.diagnostic_code) ?? "Atualização concluída"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SubscriptionStatusCell({
  subscription,
}: {
  subscription: PlatformSubscription | undefined;
}) {
  if (!subscription) {
    return (
      <td className="px-4 py-3 text-muted-foreground">
        <div className="flex items-center gap-2">
          <CreditCard className="size-4" aria-hidden />
          Checkout não iniciado
        </div>
      </td>
    );
  }

  return (
    <td className="px-4 py-3">
      <Badge variant="outline" className={subscriptionTone[subscription.status]}>
        {subscriptionStatusLabel(subscription.status)}
      </Badge>
      <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground">
        {subscription.billing_email}
      </p>
      {subscription.last_event_at && (
        <p className="text-xs text-muted-foreground">
          Atualizada em {formatDate(subscription.last_event_at)}
        </p>
      )}
    </td>
  );
}

function SubscriptionChargeCell({
  subscription,
}: {
  subscription: PlatformSubscription | undefined;
}) {
  if (!subscription) {
    return <td className="px-4 py-3 text-muted-foreground">Não informada</td>;
  }

  return (
    <td className="px-4 py-3">
      <p>{formatDate(subscription.next_payment_at)}</p>
      {subscription.access_until && (
        <p className="mt-1 text-xs text-muted-foreground">
          Acesso até {formatDate(subscription.access_until)}
        </p>
      )}
    </td>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: typeof Building2;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="size-5 text-brand" aria-hidden />
      </CardContent>
    </Card>
  );
}

function CommercialActions({
  organization,
  subscription,
  pending,
  onActivate,
  onExtend,
  onSuspend,
  onArchive,
  onRestore,
}: {
  organization: PlatformOrganization;
  subscription: PlatformSubscription | undefined;
  pending: boolean;
  onActivate: () => void;
  onExtend: (days: number) => void;
  onSuspend: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  if (organization.archived_at) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={onRestore}>
        <ArchiveRestore className="size-4" aria-hidden />
        Restaurar
      </Button>
    );
  }

  const canArchive = canArchivePlatformOrganization(subscription);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          Gerenciar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Situação comercial</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organization.effective_status !== "active" && (
          <DropdownMenuItem onSelect={onActivate}>
            <CheckCircle2 className="size-4" /> Ativar empresa
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onExtend(7)}>
          <CalendarPlus className="size-4" /> Estender teste em 7 dias
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExtend(14)}>
          <CalendarPlus className="size-4" /> Estender teste em 14 dias
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExtend(30)}>
          <CalendarPlus className="size-4" /> Estender teste em 30 dias
        </DropdownMenuItem>
        {organization.effective_status !== "suspended" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={onSuspend}>
              <ShieldAlert className="size-4" /> Suspender acesso
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" disabled={!canArchive} onSelect={onArchive}>
          <Archive className="size-4" />
          {canArchive ? "Arquivar empresa" : "Assinatura ainda possui acesso"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
