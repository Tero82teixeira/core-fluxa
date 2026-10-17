import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export function useManualAttendance(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      id,
      values,
    }: {
      action: "create" | "attach";
      id: string;
      values: Record<string, unknown>;
    }) => {
      if (!org) throw new Error("INQUIRY_WRITE_DENIED");
      const { data, error } = await supabase.rpc("real_estate_manual_attendance", {
        _organization_id: org,
        _action: action,
        _request_id: id,
        _values: values as never,
      });
      if (error) throw error;
      return data as unknown as { id: string; name: string; duplicate: boolean };
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["real-estate-inquiries", org] });
      await client.invalidateQueries({ queryKey: ["real-estate-contact-history", org] });
    },
  });
}
