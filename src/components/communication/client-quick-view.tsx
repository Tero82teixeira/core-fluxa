import { Link } from "@tanstack/react-router";
import { Building2, ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";

import type { CommunicationThread } from "@/hooks/use-communication";
import type { ClientRow, ProcessRow } from "@/hooks/use-operations";
import type { TaskRow } from "@/hooks/use-tasks";
import { digits, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusLabels: Record<string, string> = {
  lead: "Lead",
  em_cadastro: "Em cadastro",
  ativo: "Ativo",
  com_pendencia: "Com pendência",
  inativo: "Inativo",
  arquivado: "Arquivado",
};

export function ClientQuickView({
  client,
  processes,
  tasks,
  threads,
}: {
  client: ClientRow | undefined;
  processes: ProcessRow[];
  tasks: TaskRow[];
  threads: CommunicationThread[];
}) {
  if (!client) return null;

  const openProcesses = processes.filter(
    (process) => process.client_id === client.id && !process.archived_at,
  ).length;
  const openTasks = tasks.filter(
    (task) =>
      task.client_id === client.id &&
      !task.archived_at &&
      !["concluida", "arquivada"].includes(task.status),
  ).length;
  const openThreads = threads.filter(
    (thread) =>
      thread.client_id === client.id && !["resolvida", "arquivada"].includes(thread.status),
  ).length;
  const whatsapp = digits(client.whatsapp || client.phone || "");
  const whatsappRecipient = whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`;

  return (
    <section className="rounded-xl border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="size-4 text-primary" />
            <h3 className="font-semibold">Visão rápida do cliente</h3>
            <Badge variant="outline">{statusLabels[client.status] ?? client.status}</Badge>
            <Badge variant="secondary">
              {client.person_type === "pj" ? "Empresa" : "Pessoa física"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.trade_name || client.name}
            {client.owner_name ? ` · Responsável: ${client.owner_name}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/clientes/$clientId" params={{ clientId: client.id }}>
            Abrir cadastro
            <ExternalLink className="ml-2 size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <QuickMetric label="Processos ativos" value={openProcesses} />
        <QuickMetric label="Tarefas abertas" value={openTasks} />
        <QuickMetric label="Conversas abertas" value={openThreads} />
        <div className="rounded-lg border bg-background p-3">
          <p className="text-xs text-muted-foreground">Último contato</p>
          <p className="mt-1 text-sm font-medium">
            {client.last_interaction_at ? formatDate(client.last_interaction_at) : "Não registrado"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {client.phone && (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${digits(client.phone)}`}>
              <Phone className="mr-2 size-4" />
              Ligar
            </a>
          </Button>
        )}
        {whatsapp && (
          <Button asChild variant="outline" size="sm">
            <a href={`https://wa.me/${whatsappRecipient}`} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 size-4" />
              WhatsApp
            </a>
          </Button>
        )}
        {client.email && (
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${client.email}`}>
              <Mail className="mr-2 size-4" />
              E-mail
            </a>
          </Button>
        )}
        {!client.phone && !whatsapp && !client.email && (
          <span className="text-xs text-muted-foreground">
            Nenhum canal de contato disponível para o seu perfil.
          </span>
        )}
      </div>
    </section>
  );
}

function QuickMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
