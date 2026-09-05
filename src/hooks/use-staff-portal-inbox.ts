import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { CommunicationPriority, CommunicationStatus } from "@/lib/communication";

export type StaffPortalInboxThread = {
  thread_id: string;
  client_id: string;
  client_name: string;
  subject: string;
  status: CommunicationStatus;
  priority: CommunicationPriority;
  assigned_to: string | null;
  opened_by_client: boolean;
  last_message: string | null;
  last_message_at: string | null;
  updated_at: string;
};

export function useStaffPortalInbox(organizationId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["staff-client-portal-inbox", organizationId],
    refetchInterval: 15_000,
    queryFn: async (): Promise<StaffPortalInboxThread[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("staff_client_portal_inbox", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as StaffPortalInboxThread[];
    },
  });
}
