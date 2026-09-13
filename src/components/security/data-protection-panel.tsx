import { useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Download,
  FileClock,
  History,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useExportOrganizationBackup,
  useOrganizationAudit,
  useOrganizationBackups,
} from "@/hooks/use-data-protection";
import { auditActionLabel, auditMetadataSummary, formatFileSize } from "@/lib/data-protection";
import { describeError } from "@/lib/errors";

function formatDate(value: string | null | undefined) {
  if (!value) return "Ainda não realizada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function metadataNumber(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" ? value : null;
}

export function DataProtectionPanel({
  organizationId,
  organizationName,
  canManage,
}: {
  organizationId: string | null;
  organizationName: string;
  canManage: boolean;
}) {
  const backups = useOrganizationBackups(organizationId);
  const audit = useOrganizationAudit(organizationId);
  const exporter = useExportOrganizationBackup(organizationId);
  const [progress, setProgress] = useState({ completed: 0, total: 1, label: "" });
  const [search, setSearch] = useState("");
  const latest = backups.data?.[0];
  const filteredAudit = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return audit.data ?? [];
    return (audit.data ?? []).filter((event) =>
      [
        auditActionLabel(event.action),
        event.entity,
        event.actor_name,
        auditMetadataSummary(event.metadata),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [audit.data, search]);

  const exportBackup = async () => {
    try {
      const result = await exporter.mutateAsync({
        organizationName,
        onProgress: (completed, total, label) => setProgress({ completed, total, label }),
      });
      const omittedCount = result.restrictedSectionCount + result.unavailableSectionCount;
      if (omittedCount > 0) {
        toast.warning(
          `Backup gerado. ${omittedCount} seção(ões) protegida(s) ou ainda indisponível(is) não foram incluídas.`,
        );
      } else if (result.auditRecorded) {
        toast.success(`Backup gerado com ${result.recordCount.toLocaleString("pt-BR")} registros.`);
      } else {
        toast.warning(
          "O arquivo foi baixado, mas o histórico da exportação não pôde ser registrado.",
        );
      }
    } catch (error) {
      toast.error(describeError(error, "carregar"));
    } finally {
      setProgress({ completed: 0, total: 1, label: "" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="size-5 text-primary" /> Proteção e exportação dos dados
            </CardTitle>
            <CardDescription>
              Gere uma cópia dos dados disponíveis de clientes, processos, tarefas, financeiro,
              comunicação e históricos desta empresa.
            </CardDescription>
          </div>
          <Button
            onClick={exportBackup}
            disabled={!canManage || exporter.isPending || !organizationId}
          >
            <Download className="size-4" />
            {exporter.isPending ? "Gerando backup…" : "Gerar backup agora"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              Somente proprietário e administrador podem gerar o arquivo completo.
            </div>
          )}
          {exporter.isPending && (
            <div className="space-y-2 rounded-lg border bg-background p-3" aria-live="polite">
              <div className="flex justify-between gap-3 text-sm">
                <span>{progress.label}</span>
                <span className="text-muted-foreground">
                  {progress.completed}/{progress.total}
                </span>
              </div>
              <Progress value={(progress.completed / Math.max(progress.total, 1)) * 100} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Última exportação</p>
              <p className="mt-1 text-sm font-semibold">{formatDate(latest?.created_at)}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Registros no último arquivo</p>
              <p className="mt-1 text-sm font-semibold">
                {metadataNumber(latest?.metadata ?? null, "record_count")?.toLocaleString(
                  "pt-BR",
                ) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Tamanho do arquivo</p>
              <p className="mt-1 text-sm font-semibold">
                {formatFileSize(metadataNumber(latest?.metadata ?? null, "file_size_bytes"))}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <p>
              Chaves de API, senhas e tokens nunca entram no arquivo. Se uma seção interna bloquear
              a leitura direta, ela será identificada no manifesto sem interromper o backup. O
              inventário dos documentos é incluído; os arquivos continuam no armazenamento do FLUXA.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileClock className="size-5 text-primary" /> Histórico de backups
          </CardTitle>
          <CardDescription>
            Comprovação das exportações realizadas pela equipe administrativa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backups.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !backups.data?.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum backup gerado até agora.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {backups.data.slice(0, 5).map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {String(item.metadata?.file_name ?? "Exportação FLUXA")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.created_at)} · {item.actor_name || "Usuário autenticado"}
                    </p>
                  </div>
                  <Badge variant="outline" className="gap-1 text-emerald-700">
                    <CheckCircle2 className="size-3" /> Gerado
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-5 text-primary" /> Auditoria da empresa
            </CardTitle>
            <CardDescription>
              Quem realizou cada ação importante e quando ela aconteceu.
            </CardDescription>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar ação ou responsável…"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {audit.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : audit.isError ? (
            <p className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
              Não foi possível carregar a auditoria.
            </p>
          ) : !filteredAudit.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma ação encontrada.
            </p>
          ) : (
            <div className="max-h-[32rem] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/95 text-left text-xs">
                  <tr>
                    <th className="p-3">Ação</th>
                    <th className="p-3">Responsável</th>
                    <th className="p-3">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAudit.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="p-3">
                        <p className="font-medium">{auditActionLabel(event.action)}</p>
                        <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                          {auditMetadataSummary(event.metadata) || event.entity}
                        </p>
                      </td>
                      <td className="p-3">{event.actor_name || "Sistema/usuário"}</td>
                      <td className="whitespace-nowrap p-3 text-muted-foreground">
                        {formatDate(event.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
