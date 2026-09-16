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

export type PlatformIntegrationIncidentActivity = {
  event_id: string;
  event_type: string;
  detail: string | null;
  actor_name: string;
  created_at: string;
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

export function usePlatformIntegrationIncidentActivity(
  incident: PlatformIntegrationIncident,
  enabled: boolean,
) {
  return useQuery({
    enabled,
    queryKey: [
      "platform-integration-incident-activity",
      incident.organization_id,
      incident.integration_key,
      incident.failure_id,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_integration_incident_activity", {
        _organization_id: incident.organization_id,
        _integration_key: incident.integration_key,
        _failure_id: incident.failure_id,
        _limit: 30,
      });
      if (error) throw error;
      return (data ?? []) as PlatformIntegrationIncidentActivity[];
    },
  });
}

export function usePlatformAddIntegrationIncidentNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      integrationKey,
      failureId,
      note,
    }: {
      organizationId: string;
      integrationKey: string;
      failureId: string;
      note: string;
    }) => {
      const { error } = await supabase.rpc("platform_add_integration_incident_note", {
        _organization_id: organizationId,
        _integration_key: integrationKey,
        _failure_id: failureId,
        _note: note,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: [
          "platform-integration-incident-activity",
          variables.organizationId,
          variables.integrationKey,
          variables.failureId,
        ],
      });
    },
  });
}
