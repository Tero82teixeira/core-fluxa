import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, CalendarClock, Gauge, History, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { useClients } from "@/hooks/use-operations";
import {
  useArchiveMonitoringItem,
  useMonitoring,
  useMonitoringHistory,
  useRenewMonitoringItem,
  useSaveMonitoringItem,
  type MonitoringFilters,
  type MonitoringRow,
} from "@/hooks/use-documents";
import { DOCUMENT_CATEGORY, MONITORING_SITUATION, MONITORING_STATUS, type DocumentCategory } from "@/lib/documents";
import { describeError } from "@/lib/errors";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento — FLUXA" },
      { name: "description", content: "Painel de prazos, vencimentos e alertas antecipados da operação." },
      { property: "og:title", content: "Monitoramento — FLUXA" },
      { property: "og:description", content: "Painel de prazos, vencimentos e alertas antecipados da operação." },
    ],
  }),
  component: Page,
});

const ALL = "todos";

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

  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [windowFilter, setWindowFilter] = useState(ALL);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [renewItem, setRenewItem] = useState<MonitoringRow | null>(null);
  const [historyItem, setHistoryItem] = useState<MonitoringRow | null>(null);

  const filters: MonitoringFilters = useMemo(
    () => ({
      search,
      clientId: clientId === ALL ? null : clientId,
      type: type === ALL ? null : (type as DocumentCategory),
      window: windowFilter === ALL ? null : (windowFilter as "vencidos" | "7" | "15" | "30" | "60"),
      includeArchived,
    }),
    [search, clientId, type, windowFilter, includeArchived],
  );

  const monitoring = useMonitoring(organizationId, filters);
  const archive = useArchiveMonitoringItem(organizationId);
  const rows = monitoring.data ?? [];

  const totals = useMemo(() => {
    const all = monitoring.data ?? [];
    return {
      total: all.length,
      expired: all.filter((row) => row.is_expired).length,
      next7: all.filter((row) => row.days_remaining !== null && row.days_remaining >= 0 && row.days_remaining <= 7).length,
      next30: all.filter((row) => row.is_expiring_soon).length,
    };
  }, [monitoring.data]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Monitoramento</h1>
          <p className="page-subtitle mt-1">
            Licenças, certidões, registros e autorizações com vencimento — sempre calculados na data de hoje.
          </p>
        </div>
        {permissions.canManageMonitoring && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" aria-hidden /> Novo item
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicator label="Itens monitorados" value={totals.total} />
        <Indicator label="Vencidos" value={totals.expired} tone="danger" />
        <Indicator label="Vencem em 7 dias" value={totals.next7} tone="danger" />
        <Indicator label="Vencem em 30 dias" value={totals.next30} tone="warning" />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Buscar por título ou número"
              aria-label="Buscar itens monitorados"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Select value={clientId} onValueChange={setClientId}>
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

          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10" aria-label="Filtrar por tipo">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {Object.entries(DOCUMENT_CATEGORY).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={windowFilter} onValueChange={setWindowFilter}>
            <SelectTrigger className="h-10" aria-label="Filtrar por janela de vencimento">
              <SelectValue placeholder="Vencimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Qualquer prazo</SelectItem>
              <SelectItem value="vencidos">Vencidos</SelectItem>
              <SelectItem value="7">Próximos 7 dias</SelectItem>
              <SelectItem value="15">Próximos 15 dias</SelectItem>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
              <SelectItem value="60">Próximos 60 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button variant={includeArchived ? "default" : "outline"} onClick={() => setIncludeArchived((v) => !v)}>
            {includeArchived ? "Ocultar arquivados" : "Incluir arquivados"}
          </Button>
        </CardContent>
      </Card>

      {monitoring.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 w-full" />
          ))}
        </div>
      ) : monitoring.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Não foi possível carregar o monitoramento. Atualize a página e tente novamente.
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Gauge}
              title="Nenhum item monitorado"
              description="Documentos com validade entram aqui automaticamente. Você também pode cadastrar um item manual."
              action={
                permissions.canManageMonitoring ? (
                  <Button onClick={() => setFormOpen(true)}>
                    <CalendarClock className="size-4" aria-hidden /> Novo item
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((item) => {
            const situation = MONITORING_SITUATION[item.situation] ?? MONITORING_SITUATION.regular;
            const status = MONITORING_STATUS[item.status];
            return (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <StatusBadge label={situation.label} tone={situation.tone} />
                    <StatusBadge label={status.label} tone={status.tone} dot={false} />
                    {item.auto_generated && (
                      <span className="text-xs text-muted-foreground">gerado a partir de documento</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {DOCUMENT_CATEGORY[item.type]?.label ?? "Outros"}
                    {item.reference_number ? ` · nº ${item.reference_number}` : ""} · Validade:{" "}
                    {formatDate(item.expiration_date)}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {item.clients && (
                      <Link to="/clientes/$clientId" params={{ clientId: item.clients.id }} className="hover:underline">
                        {item.clients.name}
                      </Link>
                    )}
                    {item.processes && (
                      <Link
                        to="/processos/$processId"
                        params={{ processId: item.processes.id }}
                        className="hover:underline"
                      >
                        {item.processes.code}
                      </Link>
                    )}
                    {item.responsible_name && <span>Responsável: {item.responsible_name}</span>}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setHistoryItem(item)}>
                    <History className="size-4" aria-hidden /> Histórico
                  </Button>
                  {permissions.canManageMonitoring && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setRenewItem(item)}>
                        <RefreshCw className="size-4" aria-hidden /> Renovar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await archive.mutateAsync({ id: item.id, archived: !item.archived_at });
                            toast.success(item.archived_at ? "Item reativado." : "Item arquivado.");
                          } catch (error) {
                            toast.error(describeError(error, "monitoramento"));
                          }
                        }}
                      >
                        <Archive className="size-4" aria-hidden />
                        {item.archived_at ? "Reativar" : "Arquivar"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <MonitoringFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <RenewDialog item={renewItem} onOpenChange={(open) => !open && setRenewItem(null)} />
      <HistoryDialog item={historyItem} onOpenChange={(open) => !open && setHistoryItem(null)} />
    </div>
  );
}

function MonitoringFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { organizationId } = useWorkspace();
  const clients = useClients(organizationId);
  const save = useSaveMonitoringItem(organizationId);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentCategory>("licenca");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [clientId, setClientId] = useState(ALL);
  const [notes, setNotes] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Informe o título do item.");
      return;
    }
    if (!expirationDate) {
      toast.error("Informe a data de validade.");
      return;
    }
    try {
      await save.mutateAsync({
        values: {
          title: title.trim(),
          type,
          reference_number: reference.trim() || null,
          issue_date: issueDate || null,
          expiration_date: expirationDate,
          client_id: clientId === ALL ? null : clientId,
          notes: notes.trim() || null,
          status: "ativo",
        },
      });
      toast.success("Item de monitoramento criado.");
      setTitle("");
      setReference("");
      setIssueDate("");
      setExpirationDate("");
      setNotes("");
      onOpenChange(false);
    } catch (error) {
      toast.error(describeError(error, "monitoramento"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo item monitorado</DialogTitle>
          <DialogDescription>Cadastre licenças, certidões, registros ou autorizações com validade.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="mon-title">Título</Label>
            <Input id="mon-title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mon-type">Tipo</Label>
              <Select value={type} onValueChange={(value) => setType(value as DocumentCategory)}>
                <SelectTrigger id="mon-type" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_CATEGORY).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mon-ref">Número de referência</Label>
              <Input id="mon-ref" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mon-issue">Emissão</Label>
              <Input id="mon-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mon-exp">Validade</Label>
              <Input id="mon-exp" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mon-client">Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="mon-client" className="h-10">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Sem vínculo</SelectItem>
                  {(clients.data ?? []).map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mon-notes">Observações</Label>
              <Textarea id="mon-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenewDialog({ item, onOpenChange }: { item: MonitoringRow | null; onOpenChange: (open: boolean) => void }) {
  const { organizationId } = useWorkspace();
  const renew = useRenewMonitoringItem(organizationId);
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) {
          setIssueDate("");
          setExpirationDate("");
          setNotes("");
        }
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renovar item</DialogTitle>
          <DialogDescription>
            A validade anterior ({formatDate(item?.expiration_date)}) fica registrada no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="renew-issue">Nova emissão</Label>
            <Input id="renew-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="renew-exp">Nova validade</Label>
            <Input id="renew-exp" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="renew-notes">Observações</Label>
            <Textarea id="renew-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!expirationDate || renew.isPending}
            onClick={async () => {
              if (!item) return;
              try {
                await renew.mutateAsync({
                  item,
                  issueDate: issueDate || null,
                  expirationDate,
                  notes: notes.trim() || null,
                });
                toast.success("Renovação registrada.");
                onOpenChange(false);
              } catch (error) {
                toast.error(describeError(error, "monitoramento"));
              }
            }}
          >
            Registrar renovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ item, onOpenChange }: { item: MonitoringRow | null; onOpenChange: (open: boolean) => void }) {
  const history = useMonitoringHistory(item?.id ?? null);
  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de renovações</DialogTitle>
          <DialogDescription>{item?.title}</DialogDescription>
        </DialogHeader>
        {history.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma renovação registrada até o momento.</p>
        ) : (
          <ul className="space-y-3">
            {(history.data ?? []).map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border p-3">
                <p className="text-sm">
                  {formatDate(entry.previous_expiration_date)} → <strong>{formatDate(entry.new_expiration_date)}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)} · {entry.changed_by_name ?? "—"}
                </p>
                {entry.notes && <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
