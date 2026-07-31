import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, MessageSquare, Phone } from "lucide-react";

import { useClient, useProcesses, useRecentActivity, useTasks } from "@/hooks/use-operations";
import { useWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CLIENT_STATUS, FINANCIAL_STATUS, PRIORITY, PROCESS_STAGE, TASK_STATUS } from "@/lib/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { notifyDemoAction } from "@/components/shared/demo-notice";
import { formatCurrency, formatDate, initials, maskDocument, maskPhone, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes/$clientId")({
  head: () => ({
    meta: [
      { title: "Ficha do cliente — FLUXA" },
      { name: "description", content: "Visão 360 do cliente: cadastro, processos, documentos, financeiro e histórico." },
      { property: "og:title", content: "Ficha do cliente — FLUXA" },
      { property: "og:description", content: "Visão 360 do cliente: cadastro, processos, documentos, financeiro e histórico." },
    ],
  }),
  component: ClientDetail,
});

function ClientDetail() {
  const { clientId } = Route.useParams();
  const { organizationId } = useWorkspace();
  const client = useClient(clientId);
  const processes = useProcesses(organizationId);
  const tasks = useTasks(organizationId);
  const allMovements = useRecentActivity(organizationId);

  if (!client.data) {
    return <p className="p-6 text-sm text-muted-foreground">Cliente não encontrado.</p>;
  }

  const data = client.data;
  const related = (processes.data ?? []).filter((process) => process.client_id === clientId);
  const openRelated = related.filter((p) => !["finalizado", "arquivado", "cancelado"].includes(p.stage));
  const relatedTasks = (tasks.data ?? []).filter((task) => task.client_id === clientId);
  const history = (allMovements.data ?? []).filter((movement) =>
    related.some((process) => process.id === movement.process_id),
  );
  const contracted = data.contracted;
  const balance = data.balance;

  const summary = [
    { label: "Processos ativos", value: openRelated.length },
    { label: "Total contratado", value: formatCurrency(contracted) },
    { label: "Saldo em aberto", value: formatCurrency(balance) },
    { label: "Última interação", value: formatDate(data.last_interaction_at) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="size-12">
              <AvatarFallback>{initials(data.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-display text-xl font-semibold">{data.name}</h2>
                <StatusBadge label={CLIENT_STATUS[data.status].label} tone={CLIENT_STATUS[data.status].tone} />
                {data.awaitingReturn && <StatusBadge label="Aguardando retorno" tone="warning" />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.person_type === "pj" ? "Pessoa jurídica" : "Pessoa física"} ·{" "}
                {data.document ? maskDocument(data.document) : "Sem documento"} · {data.city}/{data.state}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Responsável interno: {data.owner_name}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => notifyDemoAction("Envio de e-mail")}>
              <Mail className="size-4" aria-hidden /> E-mail
            </Button>
            <Button variant="outline" size="sm" onClick={() => notifyDemoAction("Chamada telefônica")}>
              <Phone className="size-4" aria-hidden /> Ligar
            </Button>
            <Button variant="outline" size="sm" onClick={() => notifyDemoAction("Mensagem por WhatsApp")}>
              <MessageSquare className="size-4" aria-hidden /> WhatsApp
            </Button>
            <Button size="sm" onClick={() => notifyDemoAction("Criação de processo")}>Novo processo</Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{item.label}</p>
              <p className="mt-1.5 font-display text-xl font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Tabs defaultValue="visao">
        <TabsList className="flex-wrap">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="processos">Processos ({related.length})</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas ({relatedTasks.length})</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="visao">
          <Card>
            <CardContent className="grid gap-6 p-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Dados de contato</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">E-mail</dt>
                    <dd className="truncate">{data.email ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Telefone</dt>
                    <dd>{data.phone ? maskPhone(data.phone) : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Cidade / UF</dt>
                    <dd>{data.city}/{data.state}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Cliente desde</dt>
                    <dd>{formatDate(data.created_at)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Observações internas</h3>
                <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {data.notes}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processos">
          <Card>
            <CardContent className="p-0">
              {related.length === 0 ? (
                <EmptyState title="Nenhum processo vinculado" description="Este cliente ainda não possui processos." />
              ) : (
                <ul className="divide-y divide-border">
                  {related.map((process) => (
                    <li key={process.id}>
                      <Link
                        to="/processos/$processId"
                        params={{ processId: process.id }}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{process.code} — {process.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            Prazo {formatDate(process.due_date)} · Responsável {process.owner_name}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <StatusBadge label={PRIORITY[process.priority].label} tone={PRIORITY[process.priority].tone} />
                          <StatusBadge label={PROCESS_STAGE[process.stage].label} tone={PROCESS_STAGE[process.stage].tone} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tarefas">
          <Card>
            <CardContent className="p-0">
              {relatedTasks.length === 0 ? (
                <EmptyState title="Sem tarefas" description="Nenhuma tarefa vinculada a este cliente." />
              ) : (
                <ul className="divide-y divide-border">
                  {relatedTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(task.due_at)} · {task.assignee_name}
                        </p>
                      </div>
                      <StatusBadge label={TASK_STATUS[task.status].label} tone={TASK_STATUS[task.status].tone} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro">
          <Card>
            <CardContent className="p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total contratado</p>
                  <p className="mt-1 font-display text-xl font-semibold">{formatCurrency(contracted)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo em aberto</p>
                  <p className="mt-1 font-display text-xl font-semibold">{formatCurrency(balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Situação</p>
                  <p className="mt-1">
                    <StatusBadge
                      label={balance > 0 ? FINANCIAL_STATUS.pendente.label : FINANCIAL_STATUS.pago.label}
                      tone={balance > 0 ? FINANCIAL_STATUS.pendente.tone : FINANCIAL_STATUS.pago.tone}
                    />
                  </p>
                </div>
              </div>
              <Separator className="my-6" />
              <ul className="space-y-3">
                {related.map((process) => (
                  <li key={process.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{process.code} — {process.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{formatCurrency(process.value)}</span>
                      <StatusBadge
                        label={FINANCIAL_STATUS[process.financial_status].label}
                        tone={FINANCIAL_STATUS[process.financial_status].tone}
                      />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs text-muted-foreground">
                Valores demonstrativos — o módulo Financeiro completo ainda será liberado.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardContent className="p-6">
              {history.length === 0 ? (
                <EmptyState title="Sem histórico" description="Nenhuma movimentação registrada para este cliente." />
              ) : (
                <ul className="space-y-4">
                  {history.map((movement) => (
                    <li key={movement.id} className="border-l-2 border-border pl-4">
                      <p className="text-sm font-medium">{movement.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {movement.actor_name ?? "Sistema"} · {relativeTime(movement.created_at)}
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
