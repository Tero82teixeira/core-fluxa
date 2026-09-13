import { Activity, ExternalLink, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

import { useIntegrationHealth } from "@/hooks/use-integration-health";
import {
  INTEGRATION_STATUS_LABEL,
  integrationDiagnosticMessage,
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

const statusTone: Record<IntegrationHealthStatus, string> = {
  healthy: "border-success/30 bg-success/10 text-success",
  attention: "border-destructive/30 bg-destructive/10 text-destructive",
  pending: "border-warning/30 bg-warning/10 text-warning",
  not_configured: "border-muted-foreground/30 bg-muted text-muted-foreground",
  not_reported: "border-warning/30 bg-warning/10 text-warning",
  outdated: "border-destructive/30 bg-destructive/10 text-destructive",
};

function HealthCard({ item }: { item: IntegrationHealthItem }) {
  const detail = integrationDiagnosticMessage(item.last_error_code);
  return (
    <div className="flex min-h-52 flex-col rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.category === "implantacao" ? "Edge Function" : "Serviço conectado"}
          </p>
        </div>
        <Badge variant="outline" className={statusTone[item.status]}>
          {INTEGRATION_STATUS_LABEL[item.status]}
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
        {(item.pending_count > 0 || item.error_count > 0) && (
          <p>
            {item.pending_count} pendente(s) · {item.error_count} falha(s)
          </p>
        )}
        {detail && <p className="font-medium text-destructive">{detail}</p>}
      </div>

      <div className="mt-auto pt-4">
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
  const items = query.data ?? [];
  const services = items.filter((item) => item.category === "servico");
  const deployments = items.filter((item) => item.category === "implantacao");
  const summary = integrationHealthSummary(items);
  const hasDeploymentDrift = deployments.some((item) =>
    ["not_reported", "outdated"].includes(item.status),
  );

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
              <Badge variant="outline" className={statusTone.attention}>
                {summary.attention} para verificar
              </Badge>
              <Badge variant="outline" className={statusTone.pending}>
                {summary.pending} pendente(s)
              </Badge>
              <Badge variant="outline" className={statusTone.not_configured}>
                {summary.notConfigured} não configurada(s)
              </Badge>
            </div>

            {hasDeploymentDrift ? (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
                <div>
                  <p className="font-medium">
                    GitHub e Lovable Cloud podem estar em versões diferentes
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Publique as Edge Functions indicadas e execute uma operação de teste. A versão
                    ativa será confirmada automaticamente.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
                <ShieldCheck className="size-5 text-success" aria-hidden />
                Todas as funções que já foram acionadas estão na versão esperada.
              </div>
            )}

            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">Serviços da organização</h3>
                <p className="text-sm text-muted-foreground">
                  Cobranças, comunicação, assinatura, IA e avisos.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {services.map((item) => (
                  <HealthCard key={item.integration_key} item={item} />
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
                  <HealthCard key={item.integration_key} item={item} />
                ))}
              </div>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
