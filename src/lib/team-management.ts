import type { TeamMember } from "@/hooks/use-team";

export const MEMBER_HAS_RESPONSIBILITIES_MESSAGE =
  "Este membro possui tarefas, processos ou monitoramentos ativos. Transfira essas responsabilidades para outro membro antes de desativá-lo.";

/** Normaliza os campos que o PostgREST/Supabase pode usar para devolver uma falha de RPC. */
export function teamMutationErrorMessage(error: unknown): string {
  const value = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
  } | null;
  const backendError = [value?.message, value?.details, value?.hint, value?.code]
    .filter((field): field is string => typeof field === "string")
    .join(" ");

  if (backendError.includes("MEMBER_HAS_RESPONSIBILITIES")) {
    return MEMBER_HAS_RESPONSIBILITIES_MESSAGE;
  }
  if (backendError.includes("LAST_OWNER")) {
    return "O último proprietário ativo da empresa não pode ser desativado.";
  }
  if (
    backendError.includes("CANNOT_CHANGE_OWN") ||
    backendError.includes("CANNOT_DEACTIVATE_SELF")
  ) {
    return "Você não pode alterar ou desativar o próprio acesso.";
  }
  if (backendError.includes("MEMBER_NOT_FOUND")) {
    return "O membro não foi encontrado nesta empresa.";
  }
  if (value?.code === "42501" || backendError.toLowerCase().includes("permission")) {
    return "Você não possui permissão para gerenciar este membro.";
  }
  return "Não foi possível atualizar o membro. Tente novamente ou contate o suporte.";
}

export function hasOpenResponsibilities(member: TeamMember): boolean {
  return member.openTasks + member.openProcesses + member.monitoringItems > 0;
}

/** A lista já é isolada pela consulta da organização; ainda restringimos o destino a outro membro ativo. */
export function eligibleTransferTargets(members: TeamMember[], fromUserId: string): TeamMember[] {
  return members.filter((member) => member.is_active && member.user_id !== fromUserId);
}
