import { validConsultingDate } from "./consulting-project.ts";
export const CONSULTING_FOCUSES = [
  "sales",
  "organization",
  "service",
  "finance",
  "processes",
  "other",
] as const;
export const CONSULTING_PRIORITIES = ["low", "medium", "high"] as const;
export type ConsultingDiagnosticValues = {
  focus: (typeof CONSULTING_FOCUSES)[number];
  situation: string;
  attempts: string;
  expected_result: string;
  priority: (typeof CONSULTING_PRIORITIES)[number];
  target_on: string;
};
export type ConsultingDiagnostic = Omit<ConsultingDiagnosticValues, "target_on"> & {
  target_on: string | null;
  client_id: string;
  organization_id: string;
  revision: number;
  updated_at: string;
};
export function emptyConsultingDiagnostic(): ConsultingDiagnosticValues {
  return {
    focus: "organization",
    situation: "",
    attempts: "",
    expected_result: "",
    priority: "medium",
    target_on: "",
  };
}
export function consultingDiagnosticValid(v: ConsultingDiagnosticValues) {
  const required = [v.situation, v.expected_result];
  return (
    CONSULTING_FOCUSES.includes(v.focus) &&
    CONSULTING_PRIORITIES.includes(v.priority) &&
    required.every((text) => text.trim().length >= 3 && text.length <= 2000) &&
    v.attempts.length <= 2000 &&
    validConsultingDate(v.target_on) &&
    (!v.target_on || (v.target_on >= "2000-01-01" && v.target_on <= "2100-12-31"))
  );
}
export function consultingDiagnosticPayload(v: ConsultingDiagnosticValues) {
  if (!consultingDiagnosticValid(v)) throw new Error("CONSULTING_DIAGNOSTIC_INVALID");
  return {
    focus: v.focus,
    situation: v.situation.trim(),
    attempts: v.attempts.trim(),
    expected_result: v.expected_result.trim(),
    priority: v.priority,
    target_on: v.target_on,
  };
}

export function consultingDiagnosticCanRead(role: string | null) {
  return (
    role !== null &&
    [
      "superadmin",
      "proprietario",
      "administrador",
      "gestor",
      "operacional",
      "visualizador",
    ].includes(role)
  );
}
