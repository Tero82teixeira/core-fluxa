/** Framework-independent authorization predicates shared by tests and server code. */
import type { AppRole } from "@/lib/domain";

export type OrganizationResource = { organization_id: string };

export type SessionMembership = OrganizationResource & {
  user_id: string;
  role: AppRole;
  is_active: boolean;
};

/**
 * Resolves the active membership without ever trusting rows left over from a
 * previous session. The selected organization is only a preference; identity
 * and active status are mandatory.
 */
export function resolveSessionMembership<T extends SessionMembership>(
  memberships: readonly T[],
  userId: string | null | undefined,
  selectedOrganizationId: string | null | undefined,
): T | null {
  if (!userId) return null;
  const ownActiveMemberships = memberships.filter(
    (membership) => membership.user_id === userId && membership.is_active,
  );
  return (
    ownActiveMemberships.find(
      (membership) => membership.organization_id === selectedOrganizationId,
    ) ??
    ownActiveMemberships[0] ??
    null
  );
}

export type WorkspacePermissions = {
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
  canViewFinance: boolean;
  canManageFinance: boolean;
  canExportReports: boolean;
};

/**
 * Matriz ativa do workspace.
 * Atendimento, financeiro e cliente_externo existem no enum para evolução
 * futura, mas não são papéis atribuíveis na gestão de Equipe atual e portanto
 * não recebem capacidades operacionais por esta matriz.
 */
const EDITORS: AppRole[] = ["proprietario", "administrador", "gestor", "operacional"];
const MANAGERS: AppRole[] = ["superadmin", "proprietario", "administrador", "gestor"];
const TASK_EDITORS: AppRole[] = ["superadmin", "proprietario", "administrador", "gestor", "operacional"];
const REPORT_EXPORTERS: AppRole[] = ["superadmin", "proprietario", "administrador", "gestor", "operacional"];

/** Derives UI capabilities exclusively from the authenticated membership role. */
export function permissionsForRole(role: AppRole | null): WorkspacePermissions {
  const isManager = role ? MANAGERS.includes(role) : false;
  const isEditor = role ? EDITORS.includes(role) || role === "superadmin" : false;
  const isOwnerAdmin = role === "proprietario" || role === "administrador" || role === "superadmin";
  return {
    role,
    readOnly: !isEditor,
    canCreate: isEditor,
    canEdit: isEditor,
    canMoveStage: isEditor,
    canArchive: isManager || role === "operacional",
    canManageServiceTypes: isManager,
    canManageTasks: role ? TASK_EDITORS.includes(role) : false,
    canUploadDocuments: isEditor,
    canReviewDocuments: isOwnerAdmin,
    canArchiveDocuments: isOwnerAdmin,
    canManageDocumentTypes: isOwnerAdmin,
    canManageMonitoring: isEditor,
    canManageTeam: isOwnerAdmin,
    canInviteMembers: isOwnerAdmin,
    canViewFinance: isManager,
    canManageFinance: isManager,
    canExportReports: role ? REPORT_EXPORTERS.includes(role) : false,
  };
}

export function hasAuthenticatedUser(userId: string | null | undefined): boolean {
  return Boolean(userId?.trim());
}

export function belongsToOrganization(
  resource: OrganizationResource,
  activeOrganizationId: string | null | undefined,
): boolean {
  return Boolean(activeOrganizationId && resource.organization_id === activeOrganizationId);
}

export function filterByOrganization<T extends OrganizationResource>(
  resources: readonly T[],
  activeOrganizationId: string | null | undefined,
): T[] {
  if (!activeOrganizationId) return [];
  return resources.filter((resource) => belongsToOrganization(resource, activeOrganizationId));
}

export function canAccessWorkspace(
  userId: string | null | undefined,
  memberOrganizationIds: readonly string[],
  activeOrganizationId: string | null | undefined,
): boolean {
  return Boolean(
    hasAuthenticatedUser(userId) &&
    activeOrganizationId &&
    memberOrganizationIds.includes(activeOrganizationId),
  );
}
