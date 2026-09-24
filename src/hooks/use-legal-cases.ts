import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const LEGAL_AREAS = {
  civil: "Cível",
  trabalhista: "Trabalhista",
  previdenciario: "Previdenciário",
  tributario: "Tributário",
  empresarial: "Empresarial",
  familia: "Família e sucessões",
  consumidor: "Consumidor",
  criminal: "Criminal",
  administrativo: "Administrativo",
  outro: "Outro",
} as const;

export const LEGAL_CASE_SIDES = {
  ativo: "Polo ativo",
  passivo: "Polo passivo",
  interessado: "Interessado",
} as const;

export type LegalArea = keyof typeof LEGAL_AREAS;
export type LegalCaseSide = keyof typeof LEGAL_CASE_SIDES;

export type LegalCaseProfile = {
  id: string;
  organization_id: string;
  process_id: string;
  cnj_number: string | null;
  legal_area: LegalArea | null;
  action_type: string | null;
  court: string | null;
  judicial_unit: string | null;
  district: string | null;
  state: string | null;
  opposing_party: string | null;
  case_side: LegalCaseSide | null;
  confidential: boolean;
  next_hearing_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalCaseProfileInput = Omit<
  LegalCaseProfile,
  "id" | "organization_id" | "process_id" | "created_at" | "updated_at"
>;

export type LegalAgendaHearing = {
  id: string;
  process_id: string;
  process_code: string;
  process_title: string | null;
  client_name: string;
  next_hearing_at: string;
  court: string | null;
  judicial_unit: string | null;
  district: string | null;
  state: string | null;
  confidential: boolean;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useLegalCaseProfile(
  organizationId: string | null,
  processId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["legal-case-profile", organizationId, processId],
    enabled: Boolean(enabled && organizationId && processId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("get_legal_case_profile", {
        _organization_id: organizationId,
        _process_id: processId,
      });
      if (error) throw error;
      return (data ?? null) as LegalCaseProfile | null;
    },
  });
}

export function useUpsertLegalCaseProfile(organizationId: string | null, processId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: LegalCaseProfileInput) => {
      const { data, error } = await rpc.rpc("upsert_legal_case_profile", {
        _organization_id: organizationId,
        _process_id: processId,
        _cnj_number: values.cnj_number,
        _legal_area: values.legal_area,
        _action_type: values.action_type,
        _court: values.court,
        _judicial_unit: values.judicial_unit,
        _district: values.district,
        _state: values.state,
        _opposing_party: values.opposing_party,
        _case_side: values.case_side,
        _confidential: values.confidential,
        _next_hearing_at: values.next_hearing_at,
      });
      if (error) throw error;
      return data as LegalCaseProfile;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["legal-case-profile", organizationId, processId],
      });
    },
  });
}

export function useLegalAgenda(organizationId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["legal-agenda", organizationId, from, to],
    enabled: Boolean(organizationId && from && to),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_legal_agenda", {
        _organization_id: organizationId,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as LegalAgendaHearing[];
    },
  });
}

export function formatCnjNumber(value: string | null | undefined) {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 20);
  const parts = [
    digits.slice(0, 7),
    digits.slice(7, 9),
    digits.slice(9, 13),
    digits.slice(13, 14),
    digits.slice(14, 16),
    digits.slice(16, 20),
  ].filter(Boolean);
  if (digits.length <= 7) return parts[0] ?? "";
  if (digits.length <= 9) return `${parts[0]}-${parts[1]}`;
  if (digits.length <= 13) return `${parts[0]}-${parts[1]}.${parts[2]}`;
  if (digits.length <= 14) return `${parts[0]}-${parts[1]}.${parts[2]}.${parts[3]}`;
  if (digits.length <= 16) return `${parts[0]}-${parts[1]}.${parts[2]}.${parts[3]}.${parts[4]}`;
  return `${parts[0]}-${parts[1]}.${parts[2]}.${parts[3]}.${parts[4]}.${parts[5]}`;
}
