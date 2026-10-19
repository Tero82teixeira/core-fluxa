/** Define quando a organização precisa terminar a escolha inicial antes do sistema. */
export function requiresWorkspaceSetup(
  completed: boolean,
  explorationEnabled: boolean,
  businessSegment: string | null | undefined,
): boolean {
  return !completed && (!explorationEnabled || !businessSegment);
}

/** Imobiliária e consultoria começam com perfil geral; a especialização fica em Configurações. */
export function directOnboardingSubtype(segment: string | null | undefined) {
  return segment === "real_estate" ? "brokerage" : segment === "consulting_services" ? "consulting" : null;
}

export function initialOnboardingStep(
  segment: string | null,
  subtype: string | null,
  savedStep: number,
) {
  if (!segment) return 0;
  if (!subtype) return directOnboardingSubtype(segment) ? 0 : 1;
  return Math.min(savedStep + 2, 5);
}

export function previousOnboardingStep(step: number, segment: string | null) {
  return step === 2 && directOnboardingSubtype(segment) ? 0 : Math.max(0, step - 1);
}
