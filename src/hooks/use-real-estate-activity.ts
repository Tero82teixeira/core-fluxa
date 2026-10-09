import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  InterestRow,
  InterestValues,
  VisitRow,
  VisitValues,
} from "@/lib/real-estate-activity";
const rpc = supabase as unknown as {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
export function usePropertyActivity(
  org: string | null,
  property: string,
  kind: "interests" | "visits",
  status: string,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["real-estate-activity", org, property, kind, status, page],
    enabled: Boolean(org) && enabled,
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_real_estate_activity", {
        _organization_id: org,
        _property_id: property,
        _kind: kind,
        _status: status || null,
        _page: page,
      });
      if (error) throw error;
      return data as { items: (InterestRow | VisitRow)[]; total: number };
    },
  });
}
export function useSaveActivity(org: string | null, property: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: "interest" | "visit";
      id: string;
      version: number | null;
      values: InterestValues | VisitValues;
    }) => {
      const { data, error } = await rpc.rpc(`save_real_estate_${args.kind}`, {
        _organization_id: org,
        _id: args.id,
        _expected_version: args.version,
        _values: args.values,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["real-estate-activity", org, property] });
    },
  });
}
