import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type AsaasConnection = {
  id: string;
  organization_id: string;
  environment: "sandbox" | "production";
  status: "connected" | "error" | "disconnected";
  account_name: string | null;
  settlement_account_id: string;
  last_checked_at: string | null;
  last_error_code: string | null;
};

export type AsaasCharge = {
  id: string;
  organization_id: string;
  transaction_id: string;
  client_id: string;
  status:
    | "pending"
    | "confirmed"
    | "received"
    | "overdue"
    | "refunded"
    | "chargeback"
    | "cancelled"
    | "failed";
  billing_type: string;
  amount: number;
  due_date: string;
  invoice_url: string;
  paid_at: string | null;
  financial_payment_id?: string | null;
  failure_code?: string | null;
  created_at: string;
};

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("asaas-connector", { body });
  if (error)
    throw Object.assign(new Error((data as any)?.error || error.message), {
      code: (data as any)?.error,
    });
  if (data?.error) throw Object.assign(new Error(data.error), { code: data.error });
  return data;
}

export function useAsaasConnection(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["asaas-connection", organizationId],
    queryFn: async (): Promise<AsaasConnection | null> => {
      const { data, error } = await db
        .from("asaas_connections")
        .select(
          "id,organization_id,environment,status,account_name,settlement_account_id,last_checked_at,last_error_code",
        )
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useConnectAsaas(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: {
      apiKey: string;
      environment: "sandbox" | "production";
      settlementAccountId: string;
    }) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      return invoke({ action: "connect", organizationId, ...values });
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["asaas-connection", organizationId] }),
  });
}

export function useDisconnectAsaas(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      return invoke({ action: "disconnect", organizationId });
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["asaas-connection", organizationId] }),
  });
}

export function useCreateAsaasCharge(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string): Promise<AsaasCharge> => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      return (await invoke({ action: "create_charge", organizationId, transactionId })).charge;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", organizationId] }),
  });
}

export function useCancelAsaasCharge(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (chargeId: string) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      return invoke({ action: "cancel_charge", organizationId, chargeId });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", organizationId] }),
  });
}

export type PortalAsaasCharge = Pick<
  AsaasCharge,
  "status" | "billing_type" | "amount" | "due_date" | "invoice_url" | "paid_at"
> & {
  charge_id: string;
  organization_id: string;
  client_id: string;
  organization_name: string;
  description: string;
};

export function usePortalAsaasCharges(enabled: boolean, identityScope: string | null) {
  return useQuery({
    enabled,
    queryKey: ["portal-asaas-charges", identityScope],
    queryFn: async (): Promise<PortalAsaasCharge[]> => {
      const { data, error } = await db.rpc("client_portal_asaas_charges");
      if (error) throw error;
      return data ?? [];
    },
  });
}
