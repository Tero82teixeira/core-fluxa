import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type HealthPatient = {
  id: string;
  client_id: string;
  name: string;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  payer_type: "particular" | "convenio" | "pacote" | "outro";
  insurance_name: string | null;
  member_number: string | null;
  administrative_status: "ativo" | "inativo";
  created_at?: string | null;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useHealthPatients(organizationId: string | null, search: string) {
  return useQuery({
    queryKey: ["health-patients", organizationId, search],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_patients", {
        _organization_id: organizationId,
        _search: search.trim() || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthPatient[];
    },
  });
}

export function useCreateHealthPatient(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      birth_date?: string | null;
      phone?: string | null;
      email?: string | null;
      payer_type: HealthPatient["payer_type"];
      insurance_name?: string | null;
      member_number?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_patient", {
        _organization_id: organizationId,
        _name: values.name,
        _birth_date: values.birth_date || null,
        _phone: values.phone || null,
        _email: values.email || null,
        _payer_type: values.payer_type,
        _insurance_name: values.insurance_name || null,
        _member_number: values.member_number || null,
      });
      if (error) throw error;
      return data as HealthPatient;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["health-patients", organizationId] });
    },
  });
}
