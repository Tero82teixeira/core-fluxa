import {
  Activity,
  ExternalLink,
  FlaskConical,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  useAsaasAutomationStatus,
  useIntegrationFailures,
  useTestIntegrationConnection,
} from "@/hooks/use-integration-actions";
import { useIntegrationHealth } from "@/hooks/use-integration-health";
import { useRetryAsaasChargeJob } from "@/hooks/use-asaas";
import {
  INTEGRATION_STATUS_LABEL,
  integrationDeploymentNotice,
  integrationDiagnosticMessage,
  integrationActivityState,
  integrationHealthSummary,
  type IntegrationHealthItem,
  type IntegrationHealthStatus,
} from "@/lib/integration-health";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IntegrationObservabilityPanel } from "@/components/integrations/integration-observability-panel";

const statusTone: Record<IntegrationHealthStatus, string> = {
  healthy: "border-success/30 bg-success/10 text-success",
  attention: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-warning/30 bg-warning/10 text-warning",
  not_configured: "border-muted-foreground/30 bg-muted text-muted-foreground",
  not_reported: "border-warning/30 bg-warning/10 text-warning",
  outdated: "border-destructive/30 bg-destructive/10 text-destructive",
};

const testableIntegrations = new Set([
  "asaas",
  "channel-whatsapp",
  "channel-email",
  "push",
  "copilot",
]);

function HealthCard({
  item,
  testing,
  onTest,
}: {
  item: IntegrationHealthItem;
  testing: boolean;
  onTest: (integrationKey: string) => void;
}) {
  const detail = integrationDiagnosticMessage(item.last_error_code);
  const activityState = integrationActivityState(item);
  const displayedStatus = activityState === "silent" ? "silent" : item.status;
  return (
    <div className="flex min-h-52 flex-col rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.category === "implantacao" ? "Edge Function" : "Serviço conectado"}
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            displayedStatus === "silent"
              ? "border-warning/30 bg-warning/10 text-warning"
              : statusTone[displayedStatus]
          }
        >
          {displayedStatus === "silent"
            ? "Sem atividade recente"
            : INTEGRATION_STATUS_LABEL[displayedStatus]}
        </Badge>
      </div>

      <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        {item.category === "implantacao" && (
          <p>
            Versão ativa:{" "}
            <span className="font-medium text-foreground">
              {item.reported_version ?? "não informada"}
            </span>
            {item.expected_version ? ` · esperada: ${item.expected_version}` : ""}
          </p>
        )}
        <p>
          Última atividade:{" "}
          {item.last_activity_at ? formatDateTime(item.last_activity_at) : "ainda não registrada"}
        </p>
        {activityState === "never" && <p>Conectada, ainda sem operação registrada.</p>}
        {activityState === "silent" && (
          <p className="font-medium text-warning">Sem atividade registrada há mais de 30 dias.</p>
        )}
        {(item.pending_count > 0 || item.error_count > 0) && (
          <p>
            {item.pending_count} pendente(s) · {item.error_count} falha(s)
          </p>
        )}
        {detail && <p className="font-medium text-destructive">{detail}</p>}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {item.category === "servico" && testableIntegrations.has(item.integration_key) && (
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={testing || item.status === "not_configured"}
            onClick={() => onTest(item.integration_key)}
          >
            <FlaskConical className="size-3.5" aria-hidden />
            {item.integration_key === "push" ? "Enviar teste" : "Testar conexão"}
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <a href={item.action_url}>
            {item.action_label}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Button>
      </div>
    </div>
  );
}

export function IntegrationHealthPanel({
  organizationId,
  enabled,
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const query = useIntegrationHealth(organizationId, enabled);
  const failures = useIntegrationFailures(organizationId, enabled);
  const automation = useAsaasAutomationStatus(organizationId, enabled);
  const connectionTest = useTestIntegrationConnection(organizationId);
  const retryJob = useRetryAsaasChargeJob(organizationId);
  const items = query.data ?? [];
  const services = items.filter((item) => item.category === "servico");
  const deployments = items.filter((item) => item.category === "implantacao");
  const summary = integrationHealthSummary(items);
  const deploymentNotice = integrationDeploymentNotice(deployments);
  const runConnectionTest = (integrationKey: string) => {
    connectionTest.mutate(integrationKey, {
      onSuccess: (result) => {
        const delivered = Number(result?.delivered ?? 0);
        toast.success(
          integrationKey === "push"
            ? delivered > 0
              ? "Notificação de teste enviada."
              : "Nenhum aparelho ativo recebeu o teste."
            : "Conexão verificada com sucesso.",
        );
      },
      onError: (error) =>
        toast.error(
          integrationDiagnosticMessage(error instanceof Error ? error.message : null) ??
            "Não foi possível testar esta integração.",
        ),
    });
  };
  const retryFailure = (failureId: string) => {
    retryJob.mutate(failureId, {
      onSuccess: () => {
        toast.success("Cobrança recolocada na fila com segurança.");
        void failures.refetch();
        void query.refetch();
        void automation.refetch();
      },
      onError: () => toast.error("Não foi possível recolocar esta cobrança na fila."),
    });
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-brand" aria-hidden />
            Saúde das integrações
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe serviços conectados, falhas e a versão realmente publicada das funções.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} aria-hidden />
          Atualizar diagnóstico
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {query.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-52 rounded-xl" />
            ))}
          </div>
        )}
        {query.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível carregar o diagnóstico das integrações. Verifique se a migration da
            central foi aplicada.
          </div>
        )}
        {!query.isLoading && !query.isError && items.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhuma informação de integração foi encontrada.
          </p>
        )}
        {items.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={statusTone.healthy}>
                {summary.healthy} funcionando
              </Badge>
              {summary.silent > 0 && (
                <Badge variant="outline" className={statusTone.pending}>
                  {summary.silent} sem atividade
                </Badge>
              )}
              <Badge variant="outline" className={statusTone.attention}>
                {summary.attention} para verificar
              </Badge>
              {summary.awaitingConfirmation > 0 && (
                <Badge variant="outline" className={statusTone.not_reported}>
                  {summary.awaitingConfirmation} aguardando uso
                </Badge>
              )}
              <Badge variant="outline" className={statusTone.pending}>
                {summary.pending} pendente(s)
              </Badge>
              <Badge variant="outline" className={statusTone.not_configured}>
                {summary.notConfigured} não configurada(s)
              </Badge>
            </div>

            {deploymentNotice === "outdated" ? (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                <div>
                  <p className="font-medium">Existe uma função publicada em versão anterior</p>
                  <p className="mt-1 text-muted-foreground">
                    Confira a função marcada como desatualizada antes de usar essa integração.
                  </p>
                </div>
              </div>
            ) : deploymentNotice === "awaiting_first_run" ? (
              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
                <Activity className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="font-medium">Algumas funções aguardam a primeira execução</p>
                  <p className="mt-1 text-muted-foreground">
                    A publicação não está com erro. A versão será confirmada automaticamente quando
                    cada função for usada.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
                <ShieldCheck className="size-5 text-success" aria-hidden />
                Todas as funções que já foram acionadas estão na versão esperada.
              </div>
            )}

            {services.some(
              (item) =>
                item.integration_key === "asaas" &&
                item.pending_count > 0 &&
                item.error_count === 0,
            ) && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
                <p className="font-medium">Cobrança aguardando o próximo ciclo automático</p>
                <p className="mt-1 text-muted-foreground">
                  Ela já está na fila e o painel será atualizado automaticamente. Não é necessário
                  reprocessar novamente.
                </p>
              </div>
            )}

            <section className="space-y-3 rounded-xl border p-4">
              <div>
                <h3 className="font-semibold">Automação de cobranças Asaas</h3>
                <p className="text-sm text-muted-foreground">
                  Último processamento registrado e situação atual da fila desta organização.
                </p>
              </div>
              {automation.isLoading && <Skeleton className="h-16 rounded-lg" />}
              {automation.isError && (
                <p className="text-sm text-destructive">
                  Não foi possível consultar o processamento automático.
                </p>
              )}
              {!automation.isLoading && !automation.isError && (
                <div className="space-y-1 text-sm">
                  {automation.data?.last_run_at ? (
                    <>
                      <p>
                        Último processamento com cobranças:{" "}
                        {formatDateTime(automation.data.last_run_at)}
                      </p>
                      <p className="text-muted-foreground">
                        {automation.data.processed_count} processada(s) ·{" "}
                        {automation.data.succeeded_count} concluída(s) ·{" "}
                        {automation.data.failed_count} falha(s)
                      </p>
                    </>
                  ) : (
                    <p>Nenhuma cobrança automática foi processada ainda.</p>
                  )}
                  <p className="text-muted-foreground">
                    {automation.data?.queued_count
                      ? `${automation.data.queued_count} cobrança(s) na fila${
                          automation.data.next_attempt_at
                            ? ` · próxima tentativa: ${formatDateTime(automation.data.next_attempt_at)}`
                            : ""
                        }`
                      : "Fila vazia."}
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">Serviços da organização</h3>
                <p className="text-sm text-muted-foreground">
                  Cobranças, comunicação, assinatura, IA e avisos.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {services.map((item) => (
                  <HealthCard
                    key={item.integration_key}
                    item={item}
                    testing={
                      connectionTest.isPending && connectionTest.variables === item.integration_key
                    }
                    onTest={runConnectionTest}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">Versões publicadas</h3>
                <p className="text-sm text-muted-foreground">
                  Confirmação automática das funções executadas no Lovable Cloud.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {deployments.map((item) => (
                  <HealthCard
                    key={item.integration_key}
                    item={item}
                    testing={false}
                    onTest={runConnectionTest}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">Falhas recentes e reprocessamento</h3>
                <p className="text-sm text-muted-foreground">
                  Cobranças podem voltar à fila sem duplicar o pagamento. Falhas de mensagens ficam
                  disponíveis para análise manual.
                </p>
              </div>
              {failures.isLoading && <Skeleton className="h-24 rounded-xl" />}
              {failures.isError && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  Não foi possível carregar as falhas recentes.
                </p>
              )}
              {!failures.isLoading && !failures.isError && (failures.data ?? []).length === 0 && (
                <p className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
                  Nenhuma falha de integração aguarda tratamento.
                </p>
              )}
              <div className="space-y-2">
                {(failures.data ?? []).map((failure) => (
                  <div
                    key={`${failure.integration_key}-${failure.failure_id}`}
                    className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{failure.label}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {failure.description} · {integrationDiagnosticMessage(failure.error_code)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(failure.failed_at)} · {failure.attempts} tentativa(s)
                      </p>
                    </div>
                    {failure.retryable ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={retryJob.isPending}
                        onClick={() => retryFailure(failure.failure_id)}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        Reprocessar
                      </Button>
                    ) : (
                      <Badge variant="outline">Análise manual</Badge>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <IntegrationObservabilityPanel
              organizationId={organizationId}
              enabled={enabled}
              healthItems={items}
              asaasAutomation={automation.data ?? null}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
