import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { civilDateKey } from "@/lib/format";
import type { ConsultingDay, ConsultingDayKind } from "@/lib/consulting-day";

export function useConsultingDay(
  org: string | null,
  kind: ConsultingDayKind,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["consulting-day", org, civilDateKey(), kind, page],
    enabled: Boolean(org && enabled),
    placeholderData: (previous, query) => (query?.queryKey[1] === org ? previous : undefined),
    queryFn: async () => {
      if (!org) throw new Error("CONSULTING_DAY_ACCESS_DENIED");
      const { data, error } = await supabase.rpc("read_consulting_day", {
        _organization_id: org,
        _kind: kind,
        _page: page,
      });
      if (error) throw error;
      if (!data) throw new Error("CONSULTING_DAY_UNAVAILABLE");
      return data as unknown as ConsultingDay;
    },
  });
}
