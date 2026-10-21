import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  consultingDiagnosticPayload,
  type ConsultingDiagnostic,
  type ConsultingDiagnosticValues,
} from "@/lib/consulting-diagnostic";
export function useConsultingDiagnostic(org: string | null, client: string) {
  return useQuery({
    queryKey: ["consulting-diagnostic", org, client],
    enabled: Boolean(org && client),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("read_consulting_client_diagnostic", {
        _organization_id: org!,
        _client_id: client,
      });
      if (error) throw error;
      return data as unknown as ConsultingDiagnostic | null;
    },
  });
}
export function useSaveConsultingDiagnostic(org: string | null, client: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async ({
      values,
      revision,
    }: {
      values: ConsultingDiagnosticValues;
      revision: number | null;
    }) => {
      if (!org) throw new Error("NO_PERMISSION");
      const { data, error } = await supabase.rpc("save_consulting_client_diagnostic", {
        _organization_id: org,
        _client_id: client,
        _values: consultingDiagnosticPayload(values),
        _expected_revision: revision ?? undefined,
      });
      if (error) throw error;
      if (!data) throw new Error("CONSULTING_DIAGNOSTIC_NOT_CONFIRMED");
      return data as unknown as ConsultingDiagnostic;
    },
    onSuccess: (data) => {
      cache.setQueryData(["consulting-diagnostic", org, client], data);
      void cache.invalidateQueries({ queryKey: ["audit", org, client] });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ["consulting-diagnostic", org, client] });
    },
  });
}
