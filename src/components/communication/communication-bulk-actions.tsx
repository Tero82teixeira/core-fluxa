import { useState } from "react";
import { CheckSquare2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  useAssignCommunicationThread,
  useChangeCommunicationStatus,
  useUpdateCommunicationThread,
} from "@/hooks/use-communication";
import type { TeamMember } from "@/hooks/use-team";
import type { CommunicationPriority, CommunicationStatus } from "@/lib/communication";
import { describeError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statusLabels: Record<CommunicationStatus, string> = {
  aberta: "Aberta",
  aguardando_cliente: "Aguardando cliente",
  aguardando_equipe: "Aguardando equipe",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
};

const priorityLabels: Record<CommunicationPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export function CommunicationBulkActions({
  organizationId,
  selectedIds,
  team,
  canAssign,
  onClear,
}: {
  organizationId: string | null;
  selectedIds: string[];
  team: TeamMember[];
  canAssign: boolean;
  onClear: () => void;
}) {
  const [action, setAction] = useState("");
  const [applying, setApplying] = useState(false);
  const changeStatus = useChangeCommunicationStatus(organizationId);
  const updateThread = useUpdateCommunicationThread(organizationId);
  const assignThread = useAssignCommunicationThread(organizationId);

  async function apply() {
    if (!action) return toast.error("Escolha uma ação.");
    setApplying(true);
    try {
      const [kind, value] = action.split(":");
      await Promise.all(
        selectedIds.map((threadId) => {
          if (kind === "status") {
            return changeStatus.mutateAsync({
              threadId,
              status: value as CommunicationStatus,
            });
          }
          if (kind === "priority") {
            return updateThread.mutateAsync({
              threadId,
              priority: value as CommunicationPriority,
            });
          }
          return assignThread.mutateAsync({
            threadId,
            assignedTo: value === "none" ? null : value,
          });
        }),
      );
      toast.success(
        `Ação aplicada em ${selectedIds.length} ${selectedIds.length === 1 ? "conversa" : "conversas"}.`,
      );
      setAction("");
      onClear();
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <CheckSquare2 className="size-4 text-primary" />
      <strong className="text-sm">
        {selectedIds.length} {selectedIds.length === 1 ? "selecionada" : "selecionadas"}
      </strong>
      <Select value={action} onValueChange={setAction}>
        <SelectTrigger className="min-w-56 flex-1 sm:flex-none">
          <SelectValue placeholder="Escolha a ação em massa" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Alterar situação</SelectLabel>
            {(Object.keys(statusLabels) as CommunicationStatus[])
              .filter((status) => status !== "arquivada" || canAssign)
              .map((status) => (
                <SelectItem key={`status:${status}`} value={`status:${status}`}>
                  {statusLabels[status]}
                </SelectItem>
              ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Alterar prioridade</SelectLabel>
            {(Object.keys(priorityLabels) as CommunicationPriority[]).map((priority) => (
              <SelectItem key={`priority:${priority}`} value={`priority:${priority}`}>
                Prioridade {priorityLabels[priority].toLowerCase()}
              </SelectItem>
            ))}
          </SelectGroup>
          {canAssign && (
            <SelectGroup>
              <SelectLabel>Atribuir responsável</SelectLabel>
              <SelectItem value="assign:none">Sem responsável</SelectItem>
              {team
                .filter((member) => member.is_active)
                .map((member) => (
                  <SelectItem key={`assign:${member.user_id}`} value={`assign:${member.user_id}`}>
                    {member.full_name || member.email}
                  </SelectItem>
                ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" disabled={!action || applying} onClick={apply}>
        {applying && <Loader2 className="mr-2 size-4 animate-spin" />}
        Aplicar
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={applying} onClick={onClear}>
        <X className="mr-2 size-4" />
        Limpar seleção
      </Button>
    </div>
  );
}
