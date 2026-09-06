import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft, Mail, MessageSquare, Pencil, Phone, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { useClient, useClientProcesses, useTasks } from "@/hooks/use-operations";
import { useArchiveClient, useEntityHistory } from "@/hooks/use-mutations";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { describeError } from "@/lib/errors";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CLIENT_STATUS, PRIORITY, PROCESS_STAGE, TASK_STATUS } from "@/lib/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { DocumentScopePanel } from "@/components/documents/document-scope-panel";
import { ClientPortalPanel } from "@/components/clients/client-portal-panel";
import {
  formatCurrency,
  formatDate,
  initials,
  maskCEP,
  maskDocument,
  maskPhone,
  relativeTime,
} from "@/lib/format";

type ClientDetailSearch = { tab?: "portal" };

export const Route = createFileRoute("/_authenticated/clientes/$clientId")({
  validateSearch: (search: Record<string, unknown>): ClientDetailSearch =>
    search.tab === "portal" ? { tab: "portal" } : {},
  head: () => ({
    meta: [
      { title: "Ficha do cliente — FLUXA" },
      {
        name: "description",
        content: "Visão 360 do cliente: cadastro, processos, tarefas e histórico.",
      },
      { property: "og:title", content: "Ficha do cliente — FLUXA" },
      {
        property: "og:description",
        content: "Visão 360 do cliente: cadastro, processos, tarefas e histórico.",
      },
    ],
  }),
  component: ClientDetail,
});

const AUDIT_LABEL: Record<string, string> = {
  "client.created": "Cliente cadastrado",
  "client.updated": "Cadastro atualizado",
  "client.archived": "Cliente arquivado",
  "client.restored": "Cliente reativado",
};

const CLOSED = ["finalizado", "arquivado", "cancelado"];

function ClientDetail() {
  const { clientId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { organizationId, role } = useWorkspace();
  const permissions = usePermissions();
  const client = useClient(clientId);
  const processes = useClientProcesses(clientId);
  const tasks = useTasks(organizationId);
  const history = useEntityHistory(organizationId, clientId);
  const archiveClient = useArchiveClient(organizationId);
  const [busy, setBusy] = useState(false);
  const canManageClientPortal = role === "proprietario" || role === "administrador";

  const related = processes.data ?? [];
  const openRelated = useMemo(
    () => related.filter((process) => !CLOSED.includes(process.stage)),
    [related],
  );
  const relatedTasks = (tasks.data ?? []).filter((task) => task.client_id === clientId);

  if (client.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!client.data) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">Cliente não encontrado nesta empresa.</p>
            <Button variant="outline" onClick={() => navigate({ to: "/clientes" })}>
              <ArrowLeft className="size-4" aria-hidden /> Voltar para a carteira
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = client.data;
  const contracted = related.reduce((total, process) => total + (process.value ?? 0), 0);
  const openValue = related
    .filter(
      (process) =>
        process.financial_status === "pendente" || process.financial_status === "atrasado",
    )
    .reduce((total, process) => total + (process.value ?? 0), 0);
  const archived = Boolean(data.archived_at);

  const summary = [
    { label: "Processos ativos", value: String(openRelated.length) },
    { label: "Processos totais", value: String(related.length) },
    { label: "Valor contratado", value: formatCurrency(contracted) },
    { label: "Em aberto", value: formatCurrency(openValue) },
  ];

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await archiveClient.mutateAsync({ id: clientId, restore: archived });
      toast.success(archived ? "Cliente reativado." : "Cliente arquivado.");
    } catch (error) {
      toast.error(describeError(error, "cliente"));
    } finally {
      setBusy(false);
    }
  };

  const address = [
    data.street && `${data.street}${data.number ? `, ${data.number}` : ""}`,
    data.complement,
    data.district,
    data.city && data.state ? `${data.city}/${data.state}` : (data.city ?? data.state),
    data.zip_code ? `CEP ${maskCEP(data.zip_code)}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-5 p-6">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="size-14 shrink-0">
              <AvatarFallback className="text-sm">{initials(data.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title truncate">{data.name}</h1>
                <StatusBadge
                  label={CLIENT_STATUS[data.status].label}
                  tone={CLIENT_STATUS[data.status].tone}
                />
                {archived && <StatusBadge label="Arquivado" tone="neutral" />}
              </div>
              <p className="page-subtitle mt-1.5">
                {data.person_type === "pj" ? "Pessoa jurídica" : "Pessoa física"} ·{" "}
                {data.document ? maskDocument(data.document) : "Sem documento"}
                {data.trade_name ? ` · ${data.trade_name}` : ""}
              </p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div className="min-w-0">
                  <dt className="field-label">Telefone</dt>
                  <dd className="mt-0.5 truncate">{data.phone ? maskPhone(data.phone) : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="field-label">E-mail</dt>
                  <dd className="mt-0.5 truncate">{data.email ?? "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="field-label">Responsável interno</dt>
                  <dd className="mt-0.5 truncate">{data.owner_name ?? "—"}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.email && (
              <Button variant="outline" asChild>
                <a href={`mailto:${data.email}`}>
                  <Mail className="size-4" aria-hidden /> E-mail
                </a>
              </Button>
            )}
            {data.phone && (
              <Button variant="outline" asChild>
                <a href={`tel:+55${data.phone}`}>
                  <Phone className="size-4" aria-hidden /> Ligar
                </a>
              </Button>
            )}
            {data.whatsapp && (
              <Button variant="outline" asChild>
                <a href={`https://wa.me/55${data.whatsapp}`} target="_blank" rel="noreferrer">
                  <MessageSquare className="size-4" aria-hidden /> WhatsApp
                </a>
              </Button>
            )}
            {permissions.canEdit && (
              <Button variant="outline" asChild>
                <Link to="/clientes/$clientId/editar" params={{ clientId }}>
                  <Pencil className="size-4" aria-hidden /> Editar
                </Link>
              </Button>
            )}
            {permissions.canArchive && (
              <Button variant="outline" onClick={() => void toggleArchive()} disabled={busy}>
                {archived ? (
                  <RotateCcw className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )}
                {archived ? "Reativar" : "Arquivar"}
              </Button>
            )}
            {permissions.canCreate && !archived && (
              <Button asChild>
                <Link to="/processos/novo" search={{ clientId }}>
                  Novo processo
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <p className="field-label">{item.label}</p>
              <p className="metric-value mt-2 text-2xl">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Tabs defaultValue={canManageClientPortal && search.tab === "portal" ? "portal" : "visao"}>
        <TabsList className="h-auto flex-wrap gap-1.5 p-1.5">
          <TabsTrigger value="visao" className="px-4 py-2 text-sm">
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="processos" className="px-4 py-2 text-sm">
            Processos ({related.length})
          </TabsTrigger>
          <TabsTrigger value="documentos" className="px-4 py-2 text-sm">
            Documentos
          </TabsTrigger>
          <TabsTrigger value="tarefas" className="px-4 py-2 text-sm">
            Tarefas ({relatedTasks.length})
          </TabsTrigger>
          <TabsTrigger value="historico" className="px-4 py-2 text-sm">
            Histórico
          </TabsTrigger>
          {canManageClientPortal && (
            <TabsTrigger value="portal" className="px-4 py-2 text-sm">
              Portal do Cliente
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="documentos" className="mt-4">
          <DocumentScopePanel
            clientId={clientId}
            emptyDescription="Envie documentos deste cliente para manter a ficha completa."
          />
        </TabsContent>

        {canManageClientPortal && organizationId && (
          <TabsContent value="portal" className="mt-4">
            <ClientPortalPanel
              organizationId={organizationId}
              clientId={clientId}
              clientEmail={data.email}
            />
          </TabsContent>
        )}

        <TabsContent value="visao" className="mt-4">
          <Card>
            <CardContent className="grid gap-6 p-6 md:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold">Dados cadastrais</h2>
                <Separator className="my-3" />
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="field-label">Documento</dt>
                    <dd className="mt-0.5">{data.document ? maskDocument(data.document) : "—"}</dd>
                  </div>
                  {data.person_type === "pf" ? (
                    <div>
                      <dt className="field-label">Nascimento</dt>
                      <dd className="mt-0.5">{formatDate(data.birth_date)}</dd>
                    </div>
                  ) : (
                    <div>
                      <dt className="field-label">Responsável legal</dt>
                      <dd className="mt-0.5">{data.legal_rep_name ?? "—"}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="field-label">Endereço</dt>
                    <dd className="mt-0.5">{address.length > 0 ? address.join(" · ") : "—"}</dd>
                  </div>
                  <div>
                    <dt className="field-label">Cadastrado em</dt>
                    <dd className="mt-0.5">{formatDate(data.created_at)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h2 className="text-sm font-semibold">Observações</h2>
                <Separator className="my-3" />
                <p className="text-sm whitespace-pre-line text-muted-foreground">
                  {data.notes?.trim() || "Nenhuma observação registrada."}
                </p>
                <p className="helper-text mt-4">
                  Última interação:{" "}
                  {data.last_interaction_at ? relativeTime(data.last_interaction_at) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processos" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {related.length === 0 ? (
                <EmptyState
                  icon={Pencil}
                  title="Nenhum processo para este cliente"
                  description="Abra o primeiro processo para acompanhar prazos e etapas."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {related.map((process) => (
                    <li
                      key={process.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/processos/$processId"
                          params={{ processId: process.id }}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {process.code} ·{" "}
                          {process.title ?? process.service_types?.name ?? "Processo"}
                        </Link>
                        <p className="helper-text mt-1">
                          Prazo {formatDate(process.due_date)} · Responsável{" "}
                          {process.owner_name ?? "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <StatusBadge
                          label={PROCESS_STAGE[process.stage].label}
                          tone={PROCESS_STAGE[process.stage].tone}
                        />
                        <StatusBadge
                          label={PRIORITY[process.priority].label}
                          tone={PRIORITY[process.priority].tone}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tarefas" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {relatedTasks.length === 0 ? (
                <EmptyState
                  icon={Pencil}
                  title="Nenhuma tarefa vinculada"
                  description="As tarefas criadas para este cliente aparecem aqui."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {relatedTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="helper-text mt-1">
                          Prazo {formatDate(task.due_at)} ·{" "}
                          {task.assignee_name ?? "Sem responsável"}
                        </p>
                      </div>
                      <StatusBadge
                        label={TASK_STATUS[task.status].label}
                        tone={TASK_STATUS[task.status].tone}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {(history.data ?? []).length === 0 ? (
                <EmptyState
                  icon={Pencil}
                  title="Sem histórico registrado"
                  description="Alterações no cadastro deste cliente aparecem aqui."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {(history.data ?? []).map((entry) => (
                    <li key={entry.id} className="p-4">
                      <p className="text-sm font-medium">
                        {AUDIT_LABEL[entry.action] ?? entry.action}
                      </p>
                      <p className="helper-text mt-1">
                        {entry.actor_name ?? "Sistema"} · {relativeTime(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
