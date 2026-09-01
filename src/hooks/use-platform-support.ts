import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { SupportPriority, SupportStatus } from "@/hooks/use-support-requests";

export type PlatformSupportRequest = {
  id: string;
  organization_id: string;
  organization_name: string;
  created_by: string;
  requester_name: string;
  requester_email: string | null;
  subject: string;
  category: string;
  description: string;
  priority: SupportPriority;
  status: SupportStatus;
  related_module: string | null;
  related_route: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  reply_count: number;
  last_reply_at: string | null;
};

export function usePlatformSupportRequests(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-support-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_support_requests", {
        _limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as PlatformSupportRequest[];
    },
  });
}

export function usePlatformSupportOpenCount(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-support-open-count"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_support_open_count");
      if (error) throw error;
      return Number(data ?? 0);
    },
    refetchInterval: 60_000,
  });
}

export function usePlatformUpdateSupportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SupportStatus }) => {
      const { error } = await supabase.rpc("update_support_request_status", {
        _request_id: id,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-support-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-support-open-count"] }),
      ]);
    },
  });
}
