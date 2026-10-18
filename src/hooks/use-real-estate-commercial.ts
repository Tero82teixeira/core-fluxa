import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CommercialFilters, CommercialSummary } from "@/lib/real-estate-commercial";
export function useCommercialSummary(org: string | null, filters: CommercialFilters) {
  return useQuery({
    queryKey: ["real-estate-commercial", org, filters],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("real_estate_commercial", {
        _organization_id: org!,
        _action: "summary",
        _values: filters as never,
      });
      if (error) throw error;
      return data as unknown as CommercialSummary;
    },
    refetchInterval: 60_000,
  });
}
