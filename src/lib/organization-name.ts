type OrganizationName =
  | {
      trade_name?: string | null;
      legal_name?: string | null;
    }
  | null
  | undefined;

/** Nome visível do workspace, ignorando campos vazios do onboarding. */
export function organizationDisplayName(organization: OrganizationName, fallback = "Workspace") {
  return organization?.trade_name?.trim() || organization?.legal_name?.trim() || fallback;
}
