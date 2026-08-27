import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { CommercialStatus } from "@/lib/commercial";

export type PlatformOrganization = {
  organization_id: string;
  organization_name: string;
  owner_name: string | null;
  owner_email: string | null;
  subscription_status: CommercialStatus;
  plan_code: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  notes: string | null;
  organization_created_at: string;
  member_count: number;
  client_count: number;
};

export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: ["platform-admin"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error?.code === "PGRST202" || error?.code === "42883") return false;
      if (error) throw error;
      return Boolean(data);
    },
    retry: false,
  });
}

export function usePlatformOrganizations(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_platform_organizations");
      if (error) throw error;
      return (data ?? []) as PlatformOrganization[];
    },
  });
}

export function useManagePlatformOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      action,
      days,
    }: {
      organizationId: string;
      action: "activate" | "extend_trial" | "suspend";
      days?: number;
    }) => {
      const { data, error } = await supabase.rpc("manage_platform_organization", {
        _organization_id: organizationId,
        _action: action,
        ...(days !== undefined && { _days: days }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-organizations"] }),
  });
}
