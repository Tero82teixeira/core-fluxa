import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffPortalServiceCenter } from "@/hooks/use-staff-portal-service-center";
import { useMarkStaffPortalCommunicationRead } from "@/hooks/use-staff-portal-inbox";
import {
  useAssignCommunicationThread,
  useChangeCommunicationStatus,
  useUpdateCommunicationThread,
} from "@/hooks/use-communication";
import { useTeamMembers, type TeamMember } from "@/hooks/use-team";
import {
  COMMUNICATION_PRIORITIES,
  COMMUNICATION_STATUSES,
  canAdminCommunication,
  canWriteCommunication,
  type CommunicationPriority,
  type CommunicationStatus,
} from "@/lib/communication";
import { describeError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  filterPortalServiceCenter,
  summarizePortalServiceCenter,
  type PortalServiceCenterFilters,
  type PortalServiceCenterItem,
} from "@/lib/portal-service-center";
import { useWorkspace } from "@/lib/workspace";

const STATUS: Record<string, { label: string; tone: "warning" | "info" | "success" | "neutral" | "danger" }> = {
  aberta: { label: "Aberta", tone: "info" },
  aguardando_cliente: { label: "Aguardando cliente", tone: "warning" },
  aguardando_equipe: { label: "Aguardando equipe", tone: "danger" },
  resolvida: { label: "Resolvida", tone: "success" },
  pending: { label: "Aguardando cliente", tone: "warning" },
  submitted: { label: "Aguardando análise", tone: "info" },
  revision_requested: { label: "Correção solicitada", tone: "danger" },
};

const PRIORITY_LABEL: Record<PortalServiceCenterItem["priority"], string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

const INITIAL_FILTERS: PortalServiceCenterFilters = {
  search: "",
  kind: "all",
  queue: "all",
  status: "all",
  priority: "all",
  assignee: "all",
};

export function PortalServiceCenter({
  onOpenCommunication,
}: {
  onOpenCommunication: (threadId: string) => void;
}) {
  const { organizationId, role, user } = useWorkspace();
  const allowed = canWriteCommunication(role);
  const canAssign = canAdminCommunication(role);
  const canReviewDocuments = role === "proprietario" || role === "administrador";
  const center = useStaffPortalServiceCenter(organizationId, allowed);
  const markRead = useMarkStaffPortalCommunicationRead(organizationId);
  const changeStatus = useChangeCommunicationStatus(organizationId);
  const assign = useAssignCommunicationThread(organizationId);
  const updateThread = useUpdateCommunicationThread(organizationId);
  const team = useTeamMembers(organizationId);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const items = center.data ?? [];
  const summary = useMemo(() => summarizePortalServiceCenter(items), [items]);
  const filtered = useMemo(
    () => filterPortalServiceCenter(items, filters, user?.id ?? null),
    [filters, items, user?.id],
  );
  const memberNames = useMemo(
    () => new Map((team.data ?? []).map((member) => [member.user_id, member.full_name || member.email || "Membro"])),
    [team.data],
  );
  const statuses = useMemo(
    () => [...new Set(items.map((item) => item.status))],
    [items],
  );

  if (!allowed) return null;

  function update<K extends keyof PortalServiceCenterFilters>(
    key: K,
    value: PortalServiceCenterFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function preset(
    values: Partial<PortalServiceCenterFilters>,
    active: boolean,
  ) {
    setFilters(active ? INITIAL_FILTERS : { ...INITIAL_FILTERS, ...values });
  }

  function openCommunication(threadId: string) {
    onOpenCommunication(threadId);
    markRead.mutate(threadId);
  }

  async function triage(
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(describeError(error));
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/15 bg-background shadow-lg shadow-primary/5">
      <header className="flex flex-col gap-4 border-b bg-gradient-to-r from-primary/10 via-background to-background p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Inbox className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Central de Atendimento do Portal</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mensagens, documentos e prioridades dos clientes em uma única fila.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void center.refetch()} disabled={center.isFetching}>
          {center.isFetching ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Atualizar
        </Button>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        <div className={`grid grid-cols-2 gap-3 ${canReviewDocuments ? "lg:grid-cols-4" : "lg:max-w-2xl"}`}>
          <CenterMetric
            icon={MessageSquare}
            label="Aguardando resposta"
            value={summary.waitingTeam}
            active={filters.kind === "communication" && filters.status === "aguardando_equipe"}
            onClick={() => preset(
              { kind: "communication", status: "aguardando_equipe" },
              filters.kind === "communication" && filters.status === "aguardando_equipe",
            )}
          />
          <CenterMetric
            icon={CircleAlert}
            label="Mensagens não lidas"
            value={summary.unread}
            active={filters.kind === "communication" && filters.queue === "unread"}
            onClick={() => preset(
              { kind: "communication", queue: "unread" },
              filters.kind === "communication" && filters.queue === "unread",
            )}
          />
          {canReviewDocuments && (
            <>
              <CenterMetric
                icon={FileCheck2}
                label="Documentos para analisar"
                value={summary.submitted}
                active={filters.kind === "document_request" && filters.status === "submitted"}
                onClick={() => preset(
                  { kind: "document_request", status: "submitted" },
                  filters.kind === "document_request" && filters.status === "submitted",
                )}
              />
              <CenterMetric
                icon={Clock3}
                label="Pendências vencidas"
                value={summary.overdue}
                active={filters.kind === "document_request" && filters.queue === "overdue"}
                onClick={() => preset(
                  { kind: "document_request", queue: "overdue" },
                  filters.kind === "document_request" && filters.queue === "overdue",
                )}
              />
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/20 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Cliente, assunto, processo ou arquivo"
              value={filters.search}
              onChange={(event) => update("search", event.target.value)}
            />
          </div>
          <CenterSelect value={filters.kind} onValueChange={(value) => update("kind", value as PortalServiceCenterFilters["kind"])}>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="communication">Mensagens</SelectItem>
            {canReviewDocuments && <SelectItem value="document_request">Documentos</SelectItem>}
          </CenterSelect>
          <CenterSelect value={filters.status} onValueChange={(value) => update("status", value)}>
            <SelectItem value="all">Todas as situações</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>{STATUS[status]?.label ?? status}</SelectItem>
            ))}
          </CenterSelect>
          <CenterSelect value={filters.priority} onValueChange={(value) => update("priority", value as PortalServiceCenterFilters["priority"])}>
            <SelectItem value="all">Todas as prioridades</SelectItem>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </CenterSelect>
          <CenterSelect value={filters.assignee} onValueChange={(value) => update("assignee", value)}>
            <SelectItem value="all">Todos os responsáveis</SelectItem>
            <SelectItem value="mine">Minha fila</SelectItem>
            <SelectItem value="unassigned">Sem responsável</SelectItem>
            {(team.data ?? []).filter((member) => member.is_active).map((member) => (
              <SelectItem key={member.user_id} value={member.user_id}>
                {member.full_name || member.email || "Membro"}
              </SelectItem>
            ))}
          </CenterSelect>
        </div>

        {center.isLoading ? (
          <div className="grid min-h-44 place-items-center text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : center.isError ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-5 text-sm">
            <p>Não foi possível carregar a central do portal.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void center.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center">
            <FileCheck2 className="mx-auto size-8 text-success" aria-hidden />
            <p className="mt-3 font-medium">Nenhum atendimento neste filtro</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A fila está em dia ou os filtros podem ser ajustados.
            </p>
          </div>
        ) : (
          <ul className="grid max-h-[430px] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
            {filtered.map((item) => (
              <li key={`${item.item_kind}:${item.item_id}`}>
                <ServiceItem
                  item={item}
                  assigneeName={item.assigned_to ? memberNames.get(item.assigned_to) : null}
                  team={(team.data ?? []).filter((member) => member.is_active)}
                  canAssign={canAssign}
                  pending={changeStatus.isPending || assign.isPending || updateThread.isPending}
                  onOpenCommunication={openCommunication}
                  onStatusChange={(status) => triage(
                    () => changeStatus.mutateAsync({ threadId: item.item_id, status }),
                    "Status atualizado.",
                  )}
                  onPriorityChange={(priority) => triage(
                    () => updateThread.mutateAsync({ threadId: item.item_id, priority }),
                    "Prioridade atualizada.",
                  )}
                  onAssigneeChange={(assignedTo) => triage(
                    () => assign.mutateAsync({ threadId: item.item_id, assignedTo }),
                    "Responsável atualizado.",
                  )}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CenterMetric({
  icon: Icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-primary bg-primary/10 ring-1 ring-primary/20" : "bg-background"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" aria-hidden />
      </div>
      <strong className="mt-2 block text-2xl">{value}</strong>
    </button>
  );
}

function CenterSelect({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function ServiceItem({
  item,
  assigneeName,
  team,
  canAssign,
  pending,
  onOpenCommunication,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
}: {
  item: PortalServiceCenterItem;
  assigneeName?: string | null;
  team: TeamMember[];
  canAssign: boolean;
  pending: boolean;
  onOpenCommunication: (threadId: string) => void;
  onStatusChange: (status: CommunicationStatus) => Promise<void>;
  onPriorityChange: (priority: CommunicationPriority) => Promise<void>;
  onAssigneeChange: (assignedTo: string | null) => Promise<void>;
}) {
  const status = STATUS[item.status] ?? { label: item.status, tone: "neutral" as const };
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.item_kind === "communication" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
          {item.item_kind === "communication" ? <MessageSquare className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{item.client_name}</p>
            {item.unread_count > 0 && (
              <Badge className="bg-destructive text-destructive-foreground">
                {item.unread_count > 99 ? "99+" : item.unread_count} nova(s)
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm">{item.title}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge label={status.label} tone={status.tone} />
        <Badge variant={item.priority === "urgente" ? "destructive" : "secondary"}>
          {PRIORITY_LABEL[item.priority]}
        </Badge>
        {item.opened_by_client && <Badge variant="outline">Iniciada pelo cliente</Badge>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {item.item_kind === "communication"
          ? assigneeName || "Sem responsável"
          : [item.process_code && `Processo ${item.process_code}`, item.submitted_file_name].filter(Boolean).join(" · ") || "Solicitação de documento"}
        {" · "}{item.due_date ? `Prazo ${formatDate(item.due_date)}` : formatDateTime(item.last_activity_at)}
      </p>
    </>
  );

  const className = "block w-full rounded-xl border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md";
  if (item.item_kind === "communication") {
    return (
      <article className="overflow-hidden rounded-xl border bg-background transition-all hover:border-primary/30 hover:shadow-md">
        <button
          type="button"
          className="block w-full p-4 text-left"
          onClick={() => onOpenCommunication(item.item_id)}
        >
          {content}
        </button>
        <div className="grid gap-2 border-t bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-3">
          <Select
            value={item.status}
            disabled={pending}
            onValueChange={(value) => void onStatusChange(value as CommunicationStatus)}
          >
            <SelectTrigger aria-label={`Status de ${item.title}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMUNICATION_STATUSES.filter((value) => value !== "arquivada").map((value) => (
                <SelectItem key={value} value={value}>{STATUS[value]?.label ?? value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={item.priority}
            disabled={pending}
            onValueChange={(value) => void onPriorityChange(value as CommunicationPriority)}
          >
            <SelectTrigger aria-label={`Prioridade de ${item.title}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMUNICATION_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>{PRIORITY_LABEL[value]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canAssign && (
            <Select
              value={item.assigned_to ?? "none"}
              disabled={pending}
              onValueChange={(value) => void onAssigneeChange(value === "none" ? null : value)}
            >
              <SelectTrigger aria-label={`Responsável por ${item.title}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {team.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email || "Membro"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </article>
    );
  }
  return (
    <Link
      to="/clientes/$clientId"
      params={{ clientId: item.client_id }}
      search={{ tab: "portal" }}
      className={className}
    >
      {content}
    </Link>
  );
}
