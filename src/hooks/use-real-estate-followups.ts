import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContactHistory } from "@/lib/real-estate-followups";
export function useContactHistory(org: string | null, request: string, page: number) {
  return useQuery({
    queryKey: ["real-estate-contact-history", org, request, page],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("real_estate_followups", {
        _organization_id: org!,
        _action: "history",
        _request_id: request,
        _values: { page },
      });
      if (error) throw error;
      return data as unknown as ContactHistory;
    },
  });
}
export function useSaveFollowup(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      id,
      values,
    }: {
      action: "set" | "contact";
      id: string;
      values: Record<string, unknown>;
    }) => {
      if (!org) throw new Error("INQUIRY_READ_DENIED");
      const { data, error } = await supabase.rpc("real_estate_followups", {
        _organization_id: org,
        _action: action,
        _request_id: id,
        _values: values as never,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["real-estate-inquiries", org] });
      await client.invalidateQueries({ queryKey: ["real-estate-contact-history", org] });
    },
  });
}
