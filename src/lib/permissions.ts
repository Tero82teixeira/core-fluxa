import { useMemo } from "react";

import { useWorkspace } from "@/lib/workspace";
import type { AppRole } from "@/lib/domain";

const EDITORS: AppRole[] = ["proprietario", "administrador", "gestor", "operacional", "atendimento"];
const MANAGERS: AppRole[] = ["superadmin", "proprietario", "administrador", "gestor"];
const TASK_EDITORS: AppRole[] = ["superadmin", "proprietario", "administrador", "gestor", "operacional"];

export type Permissions = {
  role: AppRole | null;
  readOnly: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canMoveStage: boolean;
  canArchive: boolean;
  canManageServiceTypes: boolean;
  canManageTasks: boolean;
  canUploadDocuments: boolean;
  canReviewDocuments: boolean;
  canArchiveDocuments: boolean;
  canManageDocumentTypes: boolean;
  canManageMonitoring: boolean;
  canManageTeam: boolean;
  canInviteMembers: boolean;
};

export const NO_PERMISSION = "Você não possui permissão para esta ação.";

/** Permissões derivadas do papel do usuário na empresa ativa (o banco também valida). */
export function usePermissions(): Permissions {
  const { role } = useWorkspace();
  return useMemo(() => {
    const current = (role ?? null) as AppRole | null;
    const isManager = current ? MANAGERS.includes(current) : false;
    const isEditor = current ? EDITORS.includes(current) || current === "superadmin" : false;
    const isOwnerAdmin = current === "proprietario" || current === "administrador" || current === "superadmin";
    return {
      role: current,
      readOnly: !isEditor,
      canCreate: isEditor,
      canEdit: isEditor,
      canMoveStage: isEditor,
      canArchive: isManager || current === "operacional",
      canManageServiceTypes: isManager,
      canManageTasks: current ? TASK_EDITORS.includes(current) : false,
      canUploadDocuments: isEditor,
      canReviewDocuments: isOwnerAdmin,
      canArchiveDocuments: isOwnerAdmin,
      canManageDocumentTypes: isOwnerAdmin,
      canManageMonitoring: isEditor,
      canManageTeam: isOwnerAdmin,
      canInviteMembers: isOwnerAdmin,
    };
  }, [role]);
}
