import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type ClientPortalNotification = {
  access_id: string;
  notification_id: string;
  organization_name: string;
  client_name: string;
  kind: "process" | "document" | "document_request" | "communication" | "system";
  title: string;
  body: string | null;
  entity_type: "process" | "document" | "document_request" | "communication" | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

const notificationKey = (identityScope: string | null) => [
  "client-portal-notifications",
  identityScope,
];

export function useClientPortalNotifications(enabled: boolean, identityScope: string | null) {
  return useQuery({
    enabled: enabled && Boolean(identityScope),
    queryKey: notificationKey(identityScope),
    refetchInterval: 60_000,
    queryFn: async (): Promise<ClientPortalNotification[]> => {
      const { data, error } = await supabase.rpc("client_portal_notifications");
      if (error) throw error;
      return (data ?? []) as ClientPortalNotification[];
    },
  });
}

export function useMarkClientPortalNotificationRead(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc("mark_client_portal_notification_read", {
        _notification_id: notificationId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKey(identityScope) }),
  });
}

export function useMarkAllClientPortalNotificationsRead(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_all_client_portal_notifications_read");
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKey(identityScope) }),
  });
}
