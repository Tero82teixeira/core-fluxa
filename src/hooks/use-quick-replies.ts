import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CommunicationQuickReply = {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type QuickReplyInput = {
  id?: string | null;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
};

export function useCommunicationQuickReplies(organizationId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["communication-quick-replies", organizationId],
    queryFn: async (): Promise<CommunicationQuickReply[]> => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("list_communication_quick_replies", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as CommunicationQuickReply[];
    },
  });
}

export function useSaveCommunicationQuickReply(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuickReplyInput) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await supabase.rpc("save_communication_quick_reply", {
        _organization_id: organizationId,
        _reply_id: input.id ?? null,
        _title: input.title.trim(),
        _content: input.content.trim(),
        _category: input.category.trim(),
        _is_active: input.isActive,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["communication-quick-replies", organizationId] }),
  });
}
