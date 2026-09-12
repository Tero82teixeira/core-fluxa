import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const db = () => supabase as any;

export type CommercialProposal = {
  id: string;
  organization_id: string;
  opportunity_id: string | null;
  client_id: string | null;
  public_token: string;
  proposal_number: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired" | "cancelled";
  title: string;
  service_description: string;
  terms: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_document: string | null;
  amount: number;
  billing_frequency: "once" | "monthly" | "quarterly" | "yearly";
  first_due_date: string;
  valid_until: string;
  asaas_auto_charge: boolean;
  sent_at: string | null;
  first_viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  accepted_by_name: string | null;
  initial_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercialProposalInput = {
  id?: string;
  opportunityId?: string | null;
  clientId?: string | null;
  title: string;
  serviceDescription: string;
  terms: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerDocument?: string | null;
  amount: number;
  billingFrequency: CommercialProposal["billing_frequency"];
  firstDueDate: string;
  validUntil: string;
  asaasAutoCharge: boolean;
};

export type PublicCommercialProposal = Pick<
  CommercialProposal,
  | "proposal_number"
  | "status"
  | "title"
  | "service_description"
  | "terms"
  | "customer_name"
  | "amount"
  | "billing_frequency"
  | "first_due_date"
  | "valid_until"
> & { organization_name: string };

const proposalSelect =
  "id,organization_id,opportunity_id,client_id,public_token,proposal_number,status,title,service_description,terms,customer_name,customer_email,customer_phone,customer_document,amount,billing_frequency,first_due_date,valid_until,asaas_auto_charge,sent_at,first_viewed_at,accepted_at,declined_at,accepted_by_name,initial_transaction_id,created_at,updated_at";

export function useCommercialProposals(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["commercial-proposals", organizationId],
    queryFn: async (): Promise<CommercialProposal[]> => {
      const { data, error } = await db()
        .from("commercial_proposals")
        .select(proposalSelect)
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CommercialProposal[];
    },
  });
}

function proposalPayload(value: CommercialProposalInput) {
  return {
    opportunity_id: value.opportunityId || null,
    client_id: value.clientId || null,
    title: value.title,
    service_description: value.serviceDescription,
    terms: value.terms,
    customer_name: value.customerName,
    customer_email: value.customerEmail || null,
    customer_phone: value.customerPhone || null,
    customer_document: value.customerDocument || null,
    amount: value.amount,
    billing_frequency: value.billingFrequency,
    first_due_date: value.firstDueDate,
    valid_until: value.validUntil,
    asaas_auto_charge: value.asaasAutoCharge,
  };
}

export function useSaveCommercialProposal(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: CommercialProposalInput) => {
      if (!organizationId) throw new Error("Selecione uma empresa ativa.");
      const { data, error } = await db().rpc("save_commercial_proposal", {
        _organization_id: organizationId,
        _proposal_id: value.id ?? null,
        _payload: proposalPayload(value),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["commercial-proposals", organizationId] }),
  });
}

export function usePublishCommercialProposal(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      proposalId,
      rotateToken = false,
    }: {
      proposalId: string;
      rotateToken?: boolean;
    }) => {
      if (!organizationId) throw new Error("Selecione uma empresa ativa.");
      const { error } = await db().rpc("publish_commercial_proposal", {
        _organization_id: organizationId,
        _proposal_id: proposalId,
        _rotate_token: rotateToken,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["commercial-proposals", organizationId] }),
  });
}

export function useCancelCommercialProposal(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proposalId: string) => {
      if (!organizationId) throw new Error("Selecione uma empresa ativa.");
      const { error } = await db().rpc("cancel_commercial_proposal", {
        _organization_id: organizationId,
        _proposal_id: proposalId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["commercial-proposals", organizationId] }),
  });
}

export async function fetchPublicCommercialProposal(token: string) {
  const { data, error } = await db().rpc("get_public_commercial_proposal", {
    _public_token: token,
  });
  if (error) throw error;
  return (data?.[0] ?? null) as PublicCommercialProposal | null;
}

export async function respondToCommercialProposal(
  token: string,
  decision: "accept" | "decline",
  acceptedByName: string,
  confirmed: boolean,
) {
  const { data, error } = await db().rpc("respond_to_commercial_proposal", {
    _public_token: token,
    _decision: decision,
    _accepted_by_name: acceptedByName || null,
    _confirmed: confirmed,
    _user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
  });
  if (error) throw error;
  return data as { accepted: boolean; already_processed?: boolean; charge_scheduled?: boolean };
}

export function commercialProposalUrl(publicToken: string) {
  if (typeof window === "undefined") return `/proposta/${publicToken}`;
  return `${window.location.origin}/proposta/${publicToken}`;
}
