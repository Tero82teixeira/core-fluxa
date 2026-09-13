import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { IntegrationHealthItem } from "@/lib/integration-health";

export function useIntegrationHealth(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId && enabled),
    queryKey: ["integration-health", organizationId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_integration_health", {
        _organization_id: organizationId!,
      });
      if (error) throw error;
      return (data ?? []) as IntegrationHealthItem[];
    },
  });
}
