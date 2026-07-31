import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, FolderOpen, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { DocumentCard } from "@/components/documents/document-list";
import { DocumentUploadDialog } from "@/components/documents/document-upload-dialog";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients } from "@/hooks/use-operations";
import { useDocumentTypes, useDocumentsPage, useDocumentsSummary, type DocumentFilters } from "@/hooks/use-documents";
import { DOCUMENT_STATUS, type DocumentStatus } from "@/lib/documents";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos — FLUXA" },
      { name: "description", content: "Repositório central de arquivos por cliente e processo, com controle de validade." },
      { property: "og:title", content: "Documentos — FLUXA" },
      { property: "og:description", content: "Repositório central de arquivos por cliente e processo, com controle de validade." },
    ],
  }),
  component: Page,
});

const ALL = "todos";
const PAGE_SIZE = 20;

function Indicator({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="field-label">{label}</p>
        <p
          className={`mt-1 text-2xl font-semibold ${
            tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : ""
          }`}
        >
          {formatNumber(value)}
        </p>
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
  const [status, setStatus] = useState(ALL);
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

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Documentos</h1>
          <p className="page-subtitle mt-1">
            Repositório central por cliente e processo, com versões e controle de validade.
          </p>
        </div>
        {permissions.canUploadDocuments && (
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="size-4" aria-hidden /> Enviar documento
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicator label="Documentos ativos" value={summary.data?.total ?? 0} />
        <Indicator label="Aguardando análise" value={summary.data?.pending ?? 0} />
        <Indicator label="Vencendo em 30 dias" value={summary.data?.expiring ?? 0} tone="warning" />
        <Indicator label="Vencidos" value={summary.data?.expired ?? 0} tone="danger" />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Buscar por título, arquivo ou número"
              aria-label="Buscar documentos"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <Select value={clientId} onValueChange={resetPage(setClientId)}>
            <SelectTrigger className="h-10" aria-label="Filtrar por cliente">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os clientes</SelectItem>
              {(clients.data ?? []).map((client) => (
                <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeId} onValueChange={resetPage(setTypeId)}>
            <SelectTrigger className="h-10" aria-label="Filtrar por tipo">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {(types.data ?? []).map((type) => (
                <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={resetPage(setStatus)}>
            <SelectTrigger className="h-10" aria-label="Filtrar por situação">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as situações</SelectItem>
              {Object.entries(DOCUMENT_STATUS).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={expiring} onValueChange={resetPage(setExpiring)}>
            <SelectTrigger className="h-10" aria-label="Filtrar por validade">
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
            variant={includeArchived ? "default" : "outline"}
            onClick={() => {
              setIncludeArchived((current) => !current);
              setPage(1);
            }}
          >
            {includeArchived ? "Ocultar arquivados" : "Incluir arquivados"}
          </Button>
        </CardContent>
      </Card>

      {documents.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24 w-full" />
          ))}
        </div>
      ) : documents.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Não foi possível carregar os documentos. Atualize a página e tente novamente.
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
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

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {formatNumber(total)} documento(s) · página {page} de {pages}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Anterior
              </Button>
              <Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
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
