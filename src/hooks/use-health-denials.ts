import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type HealthDenial = {
  id: string;
  billing_item_id: string;
  patient_name?: string;
  insurer_name?: string | null;
  service_label?: string;
  billing_amount?: number;
  denial_code: string | null;
  reason: string;
  denied_amount: number;
  recovered_amount: number;
  received_at: string;
  appeal_due_date: string | null;
  appealed_at: string | null;
  resolved_at: string | null;
  status: "aberta" | "em_recurso" | "recuperada" | "parcial" | "mantida" | "cancelada";
  administrative_notes: string | null;
  created_at?: string | null;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useHealthDenials(organizationId: string | null, search = "") {
  return useQuery({
    queryKey: ["health-denials", organizationId, search],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_denials", {
        _organization_id: organizationId,
        _search: search.trim() || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthDenial[];
    },
  });
}

export function useCreateHealthDenial(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      billing_item_id: string;
      reason: string;
      denied_amount: number;
      denial_code?: string | null;
      received_at?: string | null;
      appeal_due_date?: string | null;
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_denial", {
        _organization_id: organizationId,
        _billing_item_id: values.billing_item_id,
        _reason: values.reason,
        _denied_amount: values.denied_amount,
        _denial_code: values.denial_code || null,
        _received_at: values.received_at || null,
        _appeal_due_date: values.appeal_due_date || null,
        _administrative_notes: values.administrative_notes || null,
      });
      if (error) throw error;
      return data as HealthDenial;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["health-denials", organizationId] }),
        client.invalidateQueries({ queryKey: ["health-billing-items", organizationId] }),
      ]);
    },
  });
}

export function useUpdateHealthDenial(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      denial_id: string;
      status: HealthDenial["status"];
      recovered_amount: number;
      appealed_at?: string | null;
      resolved_at?: string | null;
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("update_health_denial", {
        _organization_id: organizationId,
        _denial_id: values.denial_id,
        _status: values.status,
        _recovered_amount: values.recovered_amount,
        _appealed_at: values.appealed_at || null,
        _resolved_at: values.resolved_at || null,
        _administrative_notes: values.administrative_notes || null,
      });
      if (error) throw error;
      return data as HealthDenial;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["health-denials", organizationId] }),
        client.invalidateQueries({ queryKey: ["health-billing-items", organizationId] }),
      ]);
    },
  });
}
