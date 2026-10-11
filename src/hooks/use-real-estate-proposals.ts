import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ProposalRow,
  ProposalEvent,
  ProposalInterest,
  ProposalValues,
} from "@/lib/real-estate-proposals";
const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export function usePropertyProposals(
  org: string | null,
  property: string,
  status: string,
  page: number,
) {
  return useQuery({
    queryKey: ["real-estate-proposals", org, property, status, page],
    enabled: Boolean(org),
    queryFn: () =>
      call<{ items: ProposalRow[]; total: number }>("list_real_estate_proposals", {
        _organization_id: org,
        _property_id: property,
        _status: status || null,
        _page: page,
      }),
  });
}
export function useProposalOptions(org: string | null, property: string) {
  return useQuery({
    queryKey: ["real-estate-proposal-options", org, property],
    enabled: Boolean(org),
    queryFn: () =>
      call<ProposalInterest[]>("real_estate_proposal_options", {
        _organization_id: org,
        _property_id: property,
      }),
  });
}
export function useProposalHistory(
  org: string | null,
  property: string,
  proposal: string | null,
  page: number,
) {
  return useQuery({
    queryKey: ["real-estate-proposal-history", org, property, proposal, page],
    enabled: Boolean(org && proposal),
    queryFn: () =>
      call<{ items: ProposalEvent[]; total: number }>("real_estate_proposal_history", {
        _organization_id: org,
        _property_id: property,
        _proposal_id: proposal,
        _page: page,
      }),
  });
}
export function useRecordNegotiation(org: string | null, property: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      proposal: string;
      request: string;
      version: number | null;
      values: ProposalValues;
    }) =>
      call("record_real_estate_negotiation", {
        _organization_id: org,
        _property_id: property,
        _proposal_id: args.proposal,
        _request_id: args.request,
        _expected_version: args.version,
        _values: args.values,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["real-estate-proposals", org, property] });
      await client.invalidateQueries({ queryKey: ["real-estate-proposal-history", org, property] });
    },
  });
}
