import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { PortalServiceCenterItem } from "@/lib/portal-service-center";

export function useStaffPortalServiceCenter(
  organizationId: string | null,
  enabled = true,
) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["staff-client-portal-service-center", organizationId],
    refetchInterval: 15_000,
    queryFn: async (): Promise<PortalServiceCenterItem[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("staff_client_portal_service_center", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as PortalServiceCenterItem[];
    },
  });
}
