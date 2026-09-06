import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { CommunicationPriority, CommunicationStatus } from "@/lib/communication";
import type { PortalChatAttachment } from "@/hooks/use-portal-chat";

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

export type StaffPortalEntry = PortalChatAttachment & {
  entry_id: string;
  content: string;
  author_kind: "client" | "company";
  occurred_at: string;
  read_at: string | null;
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

export function useStaffPortalEntries(
  organizationId: string | null,
  threadId: string | null,
) {
  return useQuery({
    enabled: Boolean(organizationId && threadId),
    queryKey: ["staff-client-portal-entries", organizationId, threadId],
    refetchInterval: 15_000,
    queryFn: async (): Promise<StaffPortalEntry[]> => {
      if (!organizationId || !threadId) return [];
      const { data, error } = await supabase.rpc(
        "staff_client_portal_communication_entries",
        { _organization_id: organizationId, _thread_id: threadId },
      );
      if (error) throw error;
      return (data ?? []) as StaffPortalEntry[];
    },
  });
}

export function useMarkStaffPortalCommunicationRead(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      if (!organizationId) return;
      const { error } = await supabase.rpc("mark_staff_portal_communication_read", {
        _organization_id: organizationId,
        _thread_id: threadId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-client-portal-entries"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-portal-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-client-portal-service-center"] }),
      ]),
  });
}
