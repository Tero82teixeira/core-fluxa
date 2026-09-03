import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type ClientPortalSessionRow = {
  access_id: string;
  organization_id: string;
  client_id: string;
  organization_name: string;
  client_name: string;
  email: string;
  is_active: boolean;
  accepted_at: string;
};

export function useClientPortalSession(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["client-portal-session"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_portal_session");
      if (error) throw error;
      return (data ?? []) as ClientPortalSessionRow[];
    },
  });
}
