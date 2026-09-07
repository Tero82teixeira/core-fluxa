import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { CommunicationPriority, CommunicationStatus } from "@/lib/communication";

export type CommunicationMacro = {
  id: string;
  title: string;
  reply_content: string | null;
  status_after: CommunicationStatus | null;
  priority_after: CommunicationPriority | null;
  assign_to_self: boolean;
  follow_up_hours: number | null;
  is_active: boolean;
};

export type CommunicationMacroInput = {
  id?: string | null;
  title: string;
  replyContent: string;
  statusAfter: CommunicationStatus | null;
  priorityAfter: CommunicationPriority | null;
  assignToSelf: boolean;
  followUpHours: number | null;
  isActive: boolean;
};

const db = () => supabase as any;

export function useCommunicationMacros(organizationId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["communication-macros", organizationId],
    queryFn: async (): Promise<CommunicationMacro[]> => {
      if (!organizationId) return [];
      const { data, error } = await db().rpc("list_communication_macros", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as CommunicationMacro[];
    },
  });
}

export function useSaveCommunicationMacro(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommunicationMacroInput) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await db().rpc("save_communication_macro", {
        _organization_id: organizationId,
        _macro_id: input.id ?? null,
        _title: input.title.trim(),
        _reply_content: input.replyContent.trim() || null,
        _status_after: input.statusAfter,
        _priority_after: input.priorityAfter,
        _assign_to_self: input.assignToSelf,
        _follow_up_hours: input.followUpHours,
        _is_active: input.isActive,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["communication-macros", organizationId] }),
  });
}
