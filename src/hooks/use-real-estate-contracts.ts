import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ContractRow,
  ContractEvent,
  ContractOption,
  ContractValues,
} from "@/lib/real-estate-contracts";
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
export function usePropertyContracts(
  org: string | null,
  property: string | null,
  status: string,
  page: number,
) {
  return useQuery({
    queryKey: ["real-estate-contracts", org, property, status, page],
    enabled: Boolean(org),
    queryFn: () =>
      call<{ items: ContractRow[]; total: number }>("list_real_estate_contracts", {
        _organization_id: org,
        _property_id: property,
        _status: status || null,
        _page: page,
      }),
  });
}
export function useContractOptions(org: string | null, property: string | null) {
  return useQuery({
    queryKey: ["real-estate-contract-options", org, property],
    enabled: Boolean(org && property),
    queryFn: () =>
      call<ContractOption[]>("real_estate_contract_options", {
        _organization_id: org,
        _property_id: property,
      }),
  });
}
export function useContractHistory(org: string | null, row: ContractRow | null, page: number) {
  return useQuery({
    queryKey: ["real-estate-contract-history", org, row?.id, page],
    enabled: Boolean(org && row),
    queryFn: () =>
      call<{ items: ContractEvent[]; total: number }>("real_estate_contract_history", {
        _organization_id: org,
        _property_id: row?.property_id,
        _contract_id: row?.id,
        _page: page,
      }),
  });
}
export function useRecordContract(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      property: string;
      contract: string;
      proposal: string;
      request: string;
      version: number | null;
      values: ContractValues;
    }) =>
      call("record_real_estate_contract", {
        _organization_id: org,
        _property_id: args.property,
        _contract_id: args.contract,
        _proposal_id: args.proposal,
        _request_id: args.request,
        _expected_version: args.version,
        _values: args.values,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["real-estate-overview", org] });
      await Promise.all(
        [
          "real-estate-contracts",
          "real-estate-contract-options",
          "real-estate-contract-history",
          "real-estate-proposals",
        ].map((key) => client.invalidateQueries({ queryKey: [key, org] })),
      );
    },
  });
}
