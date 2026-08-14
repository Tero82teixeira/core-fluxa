import { useMemo } from "react";

import { useWorkspace } from "@/lib/workspace";
import { permissionsForRole, type WorkspacePermissions } from "@/lib/access-control";

export type Permissions = WorkspacePermissions;

export const NO_PERMISSION = "Você não possui permissão para esta ação.";

/** Permissões derivadas do papel do usuário na empresa ativa (o banco também valida). */
export function usePermissions(): Permissions {
  const { role } = useWorkspace();
  return useMemo(() => permissionsForRole(role), [role]);
}
