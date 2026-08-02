/** Framework-independent authorization predicates shared by tests and server code. */
export type OrganizationResource = { organization_id: string };

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
