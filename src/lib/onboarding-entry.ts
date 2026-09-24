/** Define quando a organização precisa terminar a escolha inicial antes do sistema. */
export function requiresWorkspaceSetup(
  completed: boolean,
  explorationEnabled: boolean,
  businessSegment: string | null | undefined,
): boolean {
  return !completed && (!explorationEnabled || !businessSegment);
}
