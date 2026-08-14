export const WORKSPACE_STORAGE_KEY = "fluxa-workspace";

/** The active workspace is a browser preference owned by one authenticated user. */
export function workspaceStorageKey(userId: string): string {
  return `${WORKSPACE_STORAGE_KEY}:${userId}`;
}

export function readWorkspacePreference(storage: Pick<Storage, "getItem">, userId: string): string | null {
  return storage.getItem(workspaceStorageKey(userId));
}

export function writeWorkspacePreference(
  storage: Pick<Storage, "setItem">,
  userId: string,
  organizationId: string,
): void {
  storage.setItem(workspaceStorageKey(userId), organizationId);
}
