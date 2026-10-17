import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AgendaVisit, Inquiry } from "@/lib/real-estate-inquiries";
export function useInquiries(
  org: string | null,
  filters: { kind: string; status: string; mine: boolean; search: string; page: number },
) {
  return useQuery({
    queryKey: ["real-estate-inquiries", org, filters],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("real_estate_inquiry_manage", {
        _organization_id: org!,
        _action: "load",
        _values: filters,
      });
      if (error) throw error;
      return data as unknown as { items: (Inquiry | AgendaVisit)[]; total: number };
    },
    refetchInterval: 60_000,
  });
}
export function useManageInquiry(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      id,
      values,
    }: {
      action: string;
      id?: string;
      values: Record<string, unknown>;
    }) => {
      if (!org) throw new Error("INQUIRY_READ_DENIED");
      const { data, error } = await supabase.rpc("real_estate_inquiry_manage", {
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
      await client.invalidateQueries({ queryKey: ["real-estate-activity", org] });
      await client.invalidateQueries({ queryKey: ["real-estate-overview", org] });
    },
  });
}
