import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type HealthBillingBatch = {
  id: string;
  insurer_id: string;
  insurer_name?: string | null;
  reference_period: string;
  protocol_number: string | null;
  status: "rascunho" | "enviado" | "processando" | "aceito" | "parcial" | "pago" | "rejeitado" | "cancelado";
  submitted_at: string | null;
  expected_payment_at: string | null;
  administrative_notes: string | null;
  item_count: number;
  total_amount: number;
  paid_amount: number;
  created_at?: string | null;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useHealthBillingBatches(organizationId: string | null, search = "") {
  return useQuery({
    queryKey: ["health-billing-batches", organizationId, search],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_billing_batches", {
        _organization_id: organizationId,
        _search: search.trim() || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthBillingBatch[];
    },
  });
}

export function useCreateHealthBillingBatch(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      insurer_id: string;
      reference_period: string;
      billing_item_ids: string[];
      expected_payment_at?: string | null;
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_billing_batch", {
        _organization_id: organizationId,
        _insurer_id: values.insurer_id,
        _reference_period: values.reference_period,
        _billing_item_ids: values.billing_item_ids,
        _expected_payment_at: values.expected_payment_at || null,
        _administrative_notes: values.administrative_notes || null,
      });
      if (error) throw error;
      return data as HealthBillingBatch;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["health-billing-batches", organizationId] }),
        client.invalidateQueries({ queryKey: ["health-billing-items", organizationId] }),
      ]);
    },
  });
}

export function useSubmitHealthBillingBatch(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      batch_id: string;
      protocol_number: string;
      submitted_at?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("submit_health_billing_batch", {
        _organization_id: organizationId,
        _batch_id: values.batch_id,
        _protocol_number: values.protocol_number,
        _submitted_at: values.submitted_at || null,
      });
      if (error) throw error;
      return data as HealthBillingBatch;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["health-billing-batches", organizationId] }),
        client.invalidateQueries({ queryKey: ["health-billing-items", organizationId] }),
      ]);
    },
  });
}
