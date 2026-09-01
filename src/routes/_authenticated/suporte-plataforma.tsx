import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  MessageSquareReply,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  usePlatformSupportRequests,
  usePlatformUpdateSupportStatus,
  type PlatformSupportRequest,
} from "@/hooks/use-platform-support";
import {
  useReplySupportRequest,
  useSupportRequestThread,
  type SupportStatus,
} from "@/hooks/use-support-requests";
import { useWorkspace } from "@/lib/workspace";
import { describeError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/suporte-plataforma")({
  head: () => ({
    meta: [
      { title: "Central de suporte — FLUXA" },
      {
        name: "description",
        content: "Atendimento central das empresas clientes da plataforma FLUXA.",
      },
    ],
  }),
  component: PlatformSupportPage,
});

const STATUS_LABEL: Record<SupportStatus, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aguardando_usuario: "Aguardando cliente",
  resolvido: "Resolvido",
  arquivado: "Arquivado",
};

const STATUS_TONE: Record<SupportStatus, string> = {
  aberto: "border-red-200 bg-red-50 text-red-800",
  em_analise: "border-amber-200 bg-amber-50 text-amber-800",
  aguardando_usuario: "border-blue-200 bg-blue-50 text-blue-800",
  resolvido: "border-emerald-200 bg-emerald-50 text-emerald-800",
  arquivado: "border-slate-300 bg-slate-100 text-slate-700",
};

const PRIORITY_LABEL = { baixa: "Baixa", normal: "Normal", alta: "Alta" } as const;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function PlatformSupportPage() {
  const { platformAdmin } = useWorkspace();
  const requests = usePlatformSupportRequests(platformAdmin);
  const updateStatus = usePlatformUpdateSupportStatus();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = requests.data ?? [];
  const selected = rows.find((request) => request.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter(
      (request) =>
        (!status || request.status === status) &&
        (!priority || request.priority === priority) &&
        (!term ||
          [
            request.subject,
            request.organization_name,
            request.requester_name,
            request.requester_email,
            request.category,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term))),
    );
  }, [priority, rows, search, status]);

  if (!platformAdmin) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="space-y-2 p-6 text-center">
            <ShieldAlert className="mx-auto size-8 text-destructive" aria-hidden />
            <h1 className="font-display text-xl font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground">
              Somente a administração da plataforma FLUXA pode acessar esta central.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = {
    open: rows.filter((request) => request.status === "aberto").length,
    analyzing: rows.filter((request) => request.status === "em_analise").length,
    waiting: rows.filter((request) => request.status === "aguardando_usuario").length,
    resolved: rows.filter((request) => request.status === "resolvido").length,
  };

  const changeStatus = async (id: string, nextStatus: SupportStatus) => {
    try {
      await updateStatus.mutateAsync({ id, status: nextStatus });
      toast.success("Status do atendimento atualizado.");
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="page-title">Central de suporte da plataforma</h1>
        <p className="page-subtitle">
          Receba, acompanhe e responda às solicitações das empresas clientes da FLUXA.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Novas" value={summary.open} icon={LifeBuoy} />
        <SummaryCard label="Em análise" value={summary.analyzing} icon={Clock3} />
        <SummaryCard label="Aguardando cliente" value={summary.waiting} icon={MessageSquareReply} />
        <SummaryCard label="Resolvidas" value={summary.resolved} icon={CheckCircle2} />
      </div>

      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Atendimentos</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} solicitação(ões) encontrada(s).
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,20rem)_11rem_10rem]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar empresa, cliente ou assunto…"
                aria-label="Buscar atendimentos"
              />
            </div>
            <select
              aria-label="Filtrar por status"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por prioridade"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="">Prioridades</option>
              {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {requests.isLoading && (
            <p className="p-6 text-sm text-muted-foreground">Carregando atendimentos…</p>
          )}
          {requests.isError && (
            <p className="p-6 text-sm text-destructive">
              Não foi possível carregar a central de suporte.
            </p>
          )}
          {!requests.isLoading && !requests.isError && filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma solicitação encontrada.
            </p>
          )}
          {filtered.length > 0 && (
            <div className="divide-y">
              {filtered.map((request) => (
                <div
                  key={request.id}
                  className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_13rem_11rem_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate">{request.subject}</strong>
                      <Badge variant="outline">{request.category}</Badge>
                      <Badge
                        variant="outline"
                        className={cn(request.priority === "alta" && "border-red-200 text-red-700")}
                      >
                        {PRIORITY_LABEL[request.priority]}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="size-3.5" aria-hidden />
                      {request.organization_name} · {request.requester_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Atualizado em {formatDateTime(request.updated_at)} · {request.reply_count}{" "}
                      resposta(s)
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("w-fit", STATUS_TONE[request.status])}>
                    {STATUS_LABEL[request.status]}
                  </Badge>
                  <select
                    aria-label={`Alterar status de ${request.subject}`}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={request.status}
                    disabled={request.status === "arquivado" || updateStatus.isPending}
                    onChange={(event) =>
                      void changeStatus(request.id, event.target.value as SupportStatus)
                    }
                  >
                    {Object.entries(STATUS_LABEL)
                      .filter(([value]) => value !== "arquivado")
                      .map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                  </select>
                  <Button variant="outline" onClick={() => setSelectedId(request.id)}>
                    Ver e responder
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SupportDialog request={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function SupportDialog({
  request,
  onClose,
}: {
  request: PlatformSupportRequest | null;
  onClose: () => void;
}) {
  const thread = useSupportRequestThread(request?.id ?? null);
  const reply = useReplySupportRequest(request?.organization_id ?? null, request?.id ?? null);
  const [message, setMessage] = useState("");
  const [nextStatus, setNextStatus] = useState<SupportStatus>("aguardando_usuario");

  const submit = async () => {
    if (message.trim().length < 2) {
      toast.error("Escreva uma resposta para o cliente.");
      return;
    }
    try {
      await reply.mutateAsync({ message, nextStatus });
      setMessage("");
      toast.success("Resposta enviada ao cliente.");
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>{request.subject}</DialogTitle>
              <DialogDescription>
                {request.organization_name} · {request.requester_name}
                {request.requester_email ? ` · ${request.requester_email}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Solicitação original
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{request.description}</p>
                {(request.related_module || request.related_route) && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Referência: {request.related_module || "Módulo não informado"}
                    {request.related_route ? ` · ${request.related_route}` : ""}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Histórico de respostas</h3>
                {thread.isLoading && (
                  <p className="text-sm text-muted-foreground">Carregando respostas…</p>
                )}
                {!thread.isLoading && (thread.data ?? []).length === 0 && (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhuma resposta enviada ainda.
                  </p>
                )}
                {(thread.data ?? []).map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "rounded-lg border p-3",
                      entry.author_kind === "platform" && "border-blue-200 bg-blue-50/70",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <strong>{entry.author_name}</strong>
                      <span className="text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.message}</p>
                  </div>
                ))}
              </div>

              {request.status !== "arquivado" && (
                <div className="space-y-3 rounded-lg border p-4">
                  <h3 className="font-semibold">Responder ao cliente</h3>
                  <Textarea
                    rows={5}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Escreva uma orientação clara para o cliente…"
                  />
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Situação após responder</span>
                      <select
                        className="h-9 rounded-md border bg-background px-3"
                        value={nextStatus}
                        onChange={(event) => setNextStatus(event.target.value as SupportStatus)}
                      >
                        <option value="aguardando_usuario">Aguardando cliente</option>
                        <option value="em_analise">Continuar em análise</option>
                        <option value="resolvido">Marcar como resolvido</option>
                      </select>
                    </label>
                    <Button disabled={reply.isPending} onClick={() => void submit()}>
                      <MessageSquareReply className="size-4" aria-hidden />
                      {reply.isPending ? "Enviando…" : "Enviar resposta"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof LifeBuoy;
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
