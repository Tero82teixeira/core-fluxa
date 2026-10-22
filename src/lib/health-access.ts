import type { AppRole } from "./domain";

type HealthSettings =
  | { business_segment?: string | null; enabled_modules?: unknown }
  | null
  | undefined;
const OPERATORS: readonly string[] = [
  "superadmin",
  "proprietario",
  "administrador",
  "gestor",
  "operacional",
  "atendimento",
];
const BILLING_ROLES: readonly string[] = [
  "superadmin",
  "proprietario",
  "administrador",
  "gestor",
  "financeiro",
];

/** Mirrors the existing Health RPC roles and explicit module checks; no generic role changes. */
export function healthPermissionsFor(role: AppRole | null | undefined, settings: HealthSettings) {
  const enabled = (module: string) =>
    settings?.business_segment === "health" &&
    Array.isArray(settings.enabled_modules) &&
    settings.enabled_modules.includes(module);
  const operator = OPERATORS.includes(role ?? "");
  const billing = BILLING_ROLES.includes(role ?? "");
  return {
    canManagePatients: operator && enabled("health_patients"),
    canManageAppointments: operator && enabled("health_appointments"),
    canManageInsurers: operator && enabled("health_insurance"),
    canManageAuthorizations: operator && enabled("health_authorizations"),
    canViewBilling: billing && enabled("health_billing"),
    canViewDenials: billing && enabled("health_denials"),
  };
}
