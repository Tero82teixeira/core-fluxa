import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type PlatformIntegrationIncident = {
  incident_id: string | null;
  failure_id: string;
  organization_id: string;
  organization_name: string;
  integration_key: string;
  label: string;
  error_code: string;
  failed_at: string;
  attempts: number;
  retryable: boolean;
  status: "open" | "in_progress" | "resolved";
  assigned_to: string | null;
  assigned_name: string | null;
  updated_at: string;
  is_active_failure: boolean;
};

export function usePlatformIntegrationIncidents(enabled: boolean, includeResolved: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-integration-incidents", includeResolved],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_integration_incidents", {
        _include_resolved: includeResolved,
        _limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as PlatformIntegrationIncident[];
    },
    refetchInterval: 60_000,
  });
}

export function usePlatformManageIntegrationIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      integrationKey,
      failureId,
      action,
    }: {
      organizationId: string;
      integrationKey: string;
      failureId: string;
      action: "acknowledge" | "resolve" | "reopen";
    }) => {
      const { error } = await supabase.rpc("platform_manage_integration_incident", {
        _organization_id: organizationId,
        _integration_key: integrationKey,
        _failure_id: failureId,
        _action: action,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-integration-incidents"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-integration-overview"] }),
      ]);
    },
  });
}
