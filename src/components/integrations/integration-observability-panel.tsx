import { useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  ExternalLink,
  FlaskConical,
  KeyRound,
  RotateCcw,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";

import {
  useIntegrationCredentials,
  useIntegrationReport,
  useReplayAsaasWebhook,
  useTestIntegrationConnection,
  useWebhookEvents,
  type IntegrationCredential,
} from "@/hooks/use-integration-actions";
import { integrationDiagnosticMessage } from "@/lib/integration-health";
import {
  filterWebhookEvents,
  integrationReportCsv,
  WEBHOOK_STATUS_LABEL,
} from "@/lib/integration-observability";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const credentialLabel: Record<IntegrationCredential["status"], string> = {
  healthy: "Validada",
  attention: "Atenção",
  stale: "Validar novamente",
  not_configured: "Não configurada",
};

const statusTone: Record<string, string> = {
  processed: "border-success/30 bg-success/10 text-success",
  healthy: "border-success/30 bg-success/10 text-success",
  pending: "border-warning/30 bg-warning/10 text-warning",
  stale: "border-warning/30 bg-warning/10 text-warning",
  ignored: "border-muted-foreground/30 bg-muted text-muted-foreground",
  not_configured: "border-muted-foreground/30 bg-muted text-muted-foreground",
  attention: "border-destructive/30 bg-destructive/10 text-destructive",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function IntegrationObservabilityPanel({
  organizationId,
  enabled,
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const events = useWebhookEvents(organizationId, enabled);
  const credentials = useIntegrationCredentials(organizationId, enabled);
  const report = useIntegrationReport(organizationId, enabled);
  const replay = useReplayAsaasWebhook(organizationId);
  const credentialTest = useTestIntegrationConnection(organizationId);
  const filteredEvents = useMemo(
    () => filterWebhookEvents(events.data ?? [], provider, status),
    [events.data, provider, status],
  );

  const downloadReport = () => {
    const csv = `\uFEFF${integrationReportCsv(report.data ?? [])}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fluxa-integracoes-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const testCredential = (integrationKey: string) => {
    credentialTest.mutate(integrationKey, {
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

  return (
    <div className="space-y-6 border-t pt-6">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Webhook className="size-4 text-brand" aria-hidden />
              Central de webhooks
            </h3>
            <p className="text-sm text-muted-foreground">
              Eventos do Asaas, Kiwify, WhatsApp e e-mail sem exibir o conteúdo sensível recebido.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filtrar integração"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Todas as integrações</option>
              <option value="asaas">Asaas</option>
              <option value="kiwify">Kiwify</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
            </select>
            <select
              aria-label="Filtrar situação"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Todas as situações</option>
              <option value="processed">Processados</option>
              <option value="pending">Pendentes</option>
              <option value="attention">Com atenção</option>
              <option value="failed">Com falha</option>
              <option value="ignored">Ignorados</option>
            </select>
          </div>
        </div>

        {events.isLoading && <Skeleton className="h-32 rounded-xl" />}
        {events.isError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível carregar os eventos das integrações.
          </p>
        )}
        {!events.isLoading && !events.isError && filteredEvents.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum evento encontrado para os filtros selecionados.
          </p>
        )}
        <div className="space-y-2">
          {filteredEvents.map((event) => (
            <div
              key={`${event.provider}-${event.event_record_id}`}
              className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium capitalize">{event.provider}</p>
                  <Badge variant="outline" className={statusTone[event.status]}>
                    {WEBHOOK_STATUS_LABEL[event.status]}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm">{event.event_type.replaceAll("_", " ")}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Referência: {event.reference} · recebido em {formatDateTime(event.received_at)}
                </p>
                {event.diagnostic_code && (
                  <p className="mt-1 text-sm text-destructive">
                    {integrationDiagnosticMessage(event.diagnostic_code)}
                  </p>
                )}
              </div>
              {event.replayable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={replay.isPending}
                  onClick={() =>
                    replay.mutate(event.event_record_id, {
                      onSuccess: () =>
                        toast.success("Evento reprocessado com o estado atual do Asaas."),
                      onError: () => toast.error("Não foi possível reprocessar este evento."),
                    })
                  }
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reprocessar evento
                </Button>
              ) : event.status === "failed" || event.status === "attention" ? (
                <Badge variant="outline">Análise manual</Badge>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4 text-brand" aria-hidden />
            Monitor de credenciais
          </h3>
          <p className="text-sm text-muted-foreground">
            Indica conexões com erro, não configuradas ou sem validação recente.
          </p>
        </div>
        {credentials.isLoading && <Skeleton className="h-28 rounded-xl" />}
        {credentials.isError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível verificar as credenciais das integrações.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(credentials.data ?? []).map((credential) => (
            <div key={credential.integration_key} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{credential.label}</p>
                <Badge variant="outline" className={statusTone[credential.status]}>
                  {credentialLabel[credential.status]}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {credential.last_validated_at
                  ? `Última validação: ${formatDateTime(credential.last_validated_at)}`
                  : "Ainda não há validação registrada."}
              </p>
              {credential.diagnostic_code && (
                <p className="mt-1 text-sm text-warning">
                  {integrationDiagnosticMessage(credential.diagnostic_code)}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    credential.status === "not_configured" ||
                    (credentialTest.isPending &&
                      credentialTest.variables === credential.integration_key)
                  }
                  onClick={() => testCredential(credential.integration_key)}
                >
                  <FlaskConical className="size-3.5" aria-hidden />
                  {credential.integration_key === "push" ? "Enviar teste" : "Testar agora"}
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <a href={credential.action_url}>
                    Revisar configuração <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <BarChart3 className="size-4 text-brand" aria-hidden />
              Relatório dos últimos 30 dias
            </h3>
            <p className="text-sm text-muted-foreground">
              Volume, alertas, falhas e taxa de processamento por integração.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={report.isLoading || (report.data ?? []).length === 0}
            onClick={downloadReport}
          >
            <Download className="size-3.5" aria-hidden />
            Exportar CSV
          </Button>
        </div>
        {report.isLoading && <Skeleton className="h-28 rounded-xl" />}
        {report.isError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Não foi possível calcular o relatório das integrações.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(report.data ?? []).map((item) => (
            <div key={item.provider} className="rounded-xl border p-4">
              <p className="font-medium">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold">{item.success_rate}%</p>
              <p className="text-xs text-muted-foreground">taxa de processamento</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {item.total_count} evento(s) · {item.warning_count} alerta(s) · {item.failed_count}{" "}
                falha(s)
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
