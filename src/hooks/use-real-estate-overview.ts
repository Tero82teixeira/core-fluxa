import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PropertyRow } from "./use-real-estate";
import type { ProposalRow } from "@/lib/real-estate-proposals";
import type { ContractRow } from "@/lib/real-estate-contracts";
import type { SettlementRow } from "@/lib/real-estate-settlements";
export type OverviewKind = "imovel" | "proposta" | "contrato" | "repasse";
export type OverviewItem = { id: string; property: PropertyRow; due_on: string | null } & (
  | { kind: "imovel"; data: PropertyRow }
  | { kind: "proposta"; data: ProposalRow }
  | { kind: "contrato"; data: ContractRow }
  | { kind: "repasse"; data: SettlementRow }
);
export type OverviewPage = {
  items: OverviewItem[];
  total: number;
  counts: Record<"proposta" | "contrato" | "repasse", number>;
};
const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
export function useRealEstateOverview(
  org: string | null,
  search: string,
  kind: string,
  scope: string,
  page: number,
) {
  return useQuery({
    queryKey: ["real-estate-overview", org, search, kind, scope, page],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("real_estate_overview", {
        _organization_id: org,
        _search: search || null,
        _kind: kind || null,
        _scope: scope,
        _page: page,
      });
      if (error) throw error;
      return data as OverviewPage;
    },
  });
}
