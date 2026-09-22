import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type HealthBillingItem = {
  id: string;
  patient_profile_id: string;
  patient_name?: string;
  insurer_id: string | null;
  insurer_name?: string | null;
  authorization_id: string | null;
  service_label: string;
  service_date: string;
  amount: number;
  paid_amount: number;
  billed_at: string | null;
  due_date: string | null;
  status: "rascunho" | "enviado" | "parcial" | "pago" | "glosado" | "cancelado";
  administrative_notes: string | null;
  created_at?: string | null;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useHealthBillingItems(organizationId: string | null, search = "") {
  return useQuery({
    queryKey: ["health-billing-items", organizationId, search],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_billing_items", {
        _organization_id: organizationId,
        _search: search.trim() || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthBillingItem[];
    },
  });
}

export function useCreateHealthBillingItem(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      patient_profile_id: string;
      insurer_id?: string | null;
      authorization_id?: string | null;
      service_label: string;
      service_date: string;
      amount: number;
      billed_at?: string | null;
      due_date?: string | null;
      status?: HealthBillingItem["status"];
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_billing_item", {
        _organization_id: organizationId,
        _patient_profile_id: values.patient_profile_id,
        _insurer_id: values.insurer_id || null,
        _authorization_id: values.authorization_id || null,
        _service_label: values.service_label,
        _service_date: values.service_date,
        _amount: values.amount,
        _billed_at: values.billed_at || null,
        _due_date: values.due_date || null,
        _status: values.status || "rascunho",
        _administrative_notes: values.administrative_notes || null,
      });
      if (error) throw error;
      return data as HealthBillingItem;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["health-billing-items", organizationId] });
    },
  });
}
