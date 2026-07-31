import { useMemo } from "react";

import { useWorkspace } from "@/lib/workspace";
import type { AppRole } from "@/lib/domain";

const EDITORS: AppRole[] = ["proprietario", "administrador", "gestor", "operacional", "atendimento"];
const MANAGERS: AppRole[] = ["superadmin", "proprietario", "administrador", "gestor"];

export type Permissions = {
  role: AppRole | null;
  readOnly: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canMoveStage: boolean;
  canArchive: boolean;
  canManageServiceTypes: boolean;
  canManageTasks: boolean;
};

export const NO_PERMISSION = "Você não possui permissão para esta ação.";

/** Permissões derivadas do papel do usuário na empresa ativa (o banco também valida). */
export function usePermissions(): Permissions {
  const { role } = useWorkspace();
  return useMemo(() => {
    const current = (role ?? null) as AppRole | null;
    const isManager = current ? MANAGERS.includes(current) : false;
    const isEditor = current ? EDITORS.includes(current) || current === "superadmin" : false;
    return {
      role: current,
      readOnly: !isEditor,
      canCreate: isEditor,
      canEdit: isEditor,
      canMoveStage: isEditor,
      canArchive: isManager || current === "operacional",
      canManageServiceTypes: isManager,
      canManageTasks: isEditor || current === "financeiro",
    };
  }, [role]);
}
