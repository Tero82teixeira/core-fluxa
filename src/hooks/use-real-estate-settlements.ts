import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  SettlementRow,
  SettlementOption,
  SettlementEvent,
  SettlementValues,
} from "@/lib/real-estate-settlements";
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
export function useSettlements(
  org: string | null,
  property: string | null,
  status: string,
  page: number,
) {
  return useQuery({
    queryKey: ["real-estate-settlements", org, property, status, page],
    enabled: Boolean(org),
    queryFn: () =>
      call<{
        items: SettlementRow[];
        total: number;
        totals: { commission_received: number; owner_pending: number; owner_paid: number };
      }>("list_real_estate_settlements", {
        _organization_id: org,
        _property_id: property,
        _status: status || null,
        _page: page,
      }),
  });
}
export function useSettlementOptions(org: string | null, property: string | null) {
  return useQuery({
    queryKey: ["real-estate-settlement-options", org, property],
    enabled: Boolean(org),
    queryFn: () =>
      call<SettlementOption[]>("real_estate_settlement_options", {
        _organization_id: org,
        _property_id: property,
      }),
  });
}
export function useSettlementHistory(org: string | null, row: SettlementRow | null, page: number) {
  return useQuery({
    queryKey: ["real-estate-settlement-history", org, row?.id, page],
    enabled: Boolean(org && row),
    queryFn: () =>
      call<{ items: SettlementEvent[]; total: number }>("real_estate_settlement_history", {
        _organization_id: org,
        _property_id: row?.property_id,
        _settlement_id: row?.id,
        _page: page,
      }),
  });
}
export function useRecordSettlement(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      property: string;
      settlement: string;
      contract: string;
      request: string;
      version: number | null;
      values: SettlementValues;
    }) =>
      call("record_real_estate_settlement", {
        _organization_id: org,
        _property_id: args.property,
        _settlement_id: args.settlement,
        _contract_id: args.contract,
        _request_id: args.request,
        _expected_version: args.version,
        _values: args.values,
      }),
    onSuccess: async () => {
      await Promise.all(
        ["real-estate-settlements", "real-estate-settlement-history"].map((key) =>
          client.invalidateQueries({ queryKey: [key, org] }),
        ),
      );
    },
  });
}
