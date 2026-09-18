import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CircleAlert,
  Clock3,
  FileCheck2,
  Files,
  FileText,
  FolderOpen,
  Plus,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { DocumentCard } from "@/components/documents/document-list";
import { DocumentUploadDialog } from "@/components/documents/document-upload-dialog";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients } from "@/hooks/use-operations";
import {
  useDocumentTypes,
  useDocumentsPage,
  useDocumentsSummary,
  type DocumentFilters,
} from "@/hooks/use-documents";
import {
  DOCUMENT_STATUS,
  selectDocumentStatusFilter,
  toggleArchivedDocumentsFilter,
  type DocumentStatus,
  type DocumentStatusFilter,
} from "@/lib/documents";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos — FLUXA" },
      {
        name: "description",
        content:
          "Repositório central de arquivos por cliente e processo, com controle de validade.",
      },
      { property: "og:title", content: "Documentos — FLUXA" },
      {
        property: "og:description",
        content:
          "Repositório central de arquivos por cliente e processo, com controle de validade.",
      },
    ],
  }),
  component: Page,
});

const ALL = "todos";
const PAGE_SIZE = 20;

function Indicator({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "info" | "warning" | "danger";
  icon: LucideIcon;
}) {
  const palette = {
    neutral: { bar: "bg-slate-400", icon: "bg-slate-500/10 text-slate-500" },
    info: { bar: "bg-blue-500", icon: "bg-blue-500/10 text-blue-600" },
    warning: { bar: "bg-amber-500", icon: "bg-amber-500/10 text-amber-600" },
    danger: { bar: "bg-rose-500", icon: "bg-rose-500/10 text-rose-600" },
  }[tone];
  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/70 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-panel">
      <span className={`absolute inset-x-0 top-0 h-1 ${palette.bar}`} aria-hidden />
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="field-label">{label}</p>
          <p className="metric-value mt-2">{formatNumber(value)}</p>
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${palette.icon}`}>
          <Icon className="size-4.5" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

function Page() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const clients = useClients(organizationId);
  const types = useDocumentTypes(organizationId);
  const summary = useDocumentsSummary(organizationId);

  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState(ALL);
  const [typeId, setTypeId] = useState(ALL);
  const [status, setStatus] = useState<DocumentStatusFilter>(ALL);
  const [expiring, setExpiring] = useState(ALL);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);

  const filters: DocumentFilters = useMemo(
    () => ({
      search,
      clientId: clientId === ALL ? null : clientId,
      typeId: typeId === ALL ? null : typeId,
      status: status === ALL ? null : (status as DocumentStatus),
      expiring: expiring === ALL ? null : (expiring as "vencidos" | "30" | "60"),
      includeArchived,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, clientId, typeId, status, expiring, includeArchived, page],
  );

  const documents = useDocumentsPage(organizationId, filters);
  const rows = documents.data?.rows ?? [];
  const total = documents.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-cyan-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:40px_40px]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20 ring-1 ring-white/10">
                <Files className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-cyan-300 uppercase">
                  Acervo inteligente
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
                  Documentos
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Centralize arquivos, versões e validades com contexto de cliente e processo.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-medium text-white">
                {formatNumber(summary.data?.total ?? 0)} ativo(s)
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {formatNumber(summary.data?.pending ?? 0)} aguardando análise
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {formatNumber(total)} resultado(s)
              </span>
            </div>
          </div>
          {permissions.canUploadDocuments && (
            <Button
              className="min-h-10 w-full rounded-xl bg-white text-slate-950 shadow-lg shadow-black/10 hover:bg-slate-100 sm:w-auto"
              onClick={() => setUploadOpen(true)}
            >
              <Plus className="size-4" aria-hidden /> Enviar documento
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicator
          label="Documentos ativos"
          value={summary.data?.total ?? 0}
          tone="info"
          icon={FileCheck2}
        />
        <Indicator
          label="Aguardando análise"
          value={summary.data?.pending ?? 0}
          tone="neutral"
          icon={FileText}
        />
        <Indicator
          label="Vencendo em 30 dias"
          value={summary.data?.expiring ?? 0}
          tone="warning"
          icon={Clock3}
        />
        <Indicator
          label="Vencidos"
          value={summary.data?.expired ?? 0}
          tone="danger"
          icon={CircleAlert}
        />
      </div>

      <Card className="rounded-2xl border-border/70 bg-card shadow-soft">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">
                <SlidersHorizontal className="size-4" aria-hidden />
              </span>
              Busca e filtros
            </div>
            <span className="text-xs text-muted-foreground">
              {formatNumber(total)} encontrado(s)
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative sm:col-span-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="h-10 rounded-xl border-border/70 bg-muted/20 pl-9"
                placeholder="Buscar por título, arquivo, código ou número"
                aria-label="Buscar documentos"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>

            <Select value={clientId} onValueChange={resetPage(setClientId)}>
              <SelectTrigger className="h-10 rounded-xl" aria-label="Filtrar por cliente">
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os clientes</SelectItem>
                {(clients.data ?? []).map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeId} onValueChange={resetPage(setTypeId)}>
              <SelectTrigger className="h-10 rounded-xl" aria-label="Filtrar por tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os tipos</SelectItem>
                {(types.data ?? []).map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status}
              onValueChange={(value) => {
                const next = selectDocumentStatusFilter(
                  value as DocumentStatusFilter,
                  includeArchived,
                );
                setStatus(next.status);
                setIncludeArchived(next.includeArchived);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 rounded-xl" aria-label="Filtrar por situação">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as situações</SelectItem>
                {Object.entries(DOCUMENT_STATUS).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={expiring} onValueChange={resetPage(setExpiring)}>
              <SelectTrigger className="h-10 rounded-xl" aria-label="Filtrar por validade">
                <SelectValue placeholder="Validade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Qualquer validade</SelectItem>
                <SelectItem value="vencidos">Vencidos</SelectItem>
                <SelectItem value="30">Vencendo em 30 dias</SelectItem>
                <SelectItem value="60">Vencendo em 60 dias</SelectItem>
              </SelectContent>
            </Select>

            <Button
              className="rounded-xl"
              variant={includeArchived ? "default" : "outline"}
              onClick={() => {
                const next = toggleArchivedDocumentsFilter(status, includeArchived);
                setStatus(next.status);
                setIncludeArchived(next.includeArchived);
                setPage(1);
              }}
            >
              {includeArchived ? "Ocultar arquivados" : "Incluir arquivados"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {documents.isLoading ? (
        <LoadingState label="Carregando documentos" rows={4} />
      ) : documents.isError ? (
        <ErrorState
          title="Não foi possível carregar os documentos"
          description="Tente novamente para recuperar o repositório com os filtros atuais."
          onRetry={() => void documents.refetch()}
          retrying={documents.isFetching}
        />
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardContent className="p-0">
            <EmptyState
              icon={FolderOpen}
              title="Nenhum documento encontrado"
              description={
                total === 0 && !search
                  ? "Envie o primeiro arquivo para começar o repositório da empresa."
                  : "Ajuste os filtros para encontrar o que procura."
              }
              action={
                permissions.canUploadDocuments ? (
                  <Button onClick={() => setUploadOpen(true)}>
                    <FileText className="size-4" aria-hidden /> Enviar documento
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((document) => (
              <DocumentCard key={document.id} document={document} />
            ))}
          </ul>

          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {formatNumber(total)} documento(s) · página {page} de {pages}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
