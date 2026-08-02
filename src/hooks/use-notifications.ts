import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Notification } from "@/lib/notifications";

const key = (organizationId: string | null) => ["notifications", organizationId] as const;
const db = () =>
  supabase as unknown as { from: (table: string) => any; rpc: (name: string, args: object) => any };

export function useNotifications(organizationId: string | null, limit = 20) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: [...key(organizationId), limit],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await db()
        .from("notifications")
        .select(
          "id,organization_id,user_id,kind,title,body,entity_type,entity_id,action_url,read_at,archived_at,created_at",
        )
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });
}

export function useUnreadNotificationCount(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: [...key(organizationId), "unread-count"],
    queryFn: async () => {
      const { count, error } = await db()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("read_at", null)
        .is("archived_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useNotificationRpc(organizationId: string | null, name: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: object) => {
      const { error } = await db().rpc(name, args);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key(organizationId) }),
  });
}
export const useMarkNotificationRead = (organizationId: string | null) =>
  useNotificationRpc(organizationId, "mark_notification_read");
export const useMarkAllNotificationsRead = (organizationId: string | null) =>
  useNotificationRpc(organizationId, "mark_all_notifications_read");
export const useArchiveNotification = (organizationId: string | null) =>
  useNotificationRpc(organizationId, "archive_notification");

export function useCreateTestNotification(organizationId: string | null) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await db().rpc("create_test_notification", {
        _organization: organizationId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: key(organizationId) }),
        client.invalidateQueries({ queryKey: [...key(organizationId), "unread-count"] }),
        client.invalidateQueries({ queryKey: [...key(organizationId), 5] }),
      ]);
    },
  });
}
