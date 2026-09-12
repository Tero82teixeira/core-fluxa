import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  PlatformTrialFollowup,
  PlatformTrialFollowupStatus,
} from "@/lib/platform-trial-followups";

export function usePlatformTrialFollowups(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-trial-followups"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_trial_followups");
      if (error) throw error;
      return (data ?? []) as PlatformTrialFollowup[];
    },
  });
}

export function useSavePlatformTrialFollowup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      status: PlatformTrialFollowupStatus;
      nextContactAt: string | null;
      notes: string;
      markContacted: boolean;
    }) => {
      const { error } = await supabase.rpc("save_platform_trial_followup", {
        _organization_id: input.organizationId,
        _status: input.status,
        _notes: input.notes,
        _mark_contacted: input.markContacted,
        ...(input.nextContactAt ? { _next_contact_at: input.nextContactAt } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-trial-followups"] }),
  });
}
