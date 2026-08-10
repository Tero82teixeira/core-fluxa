import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeOrganizationSettings,
  type OrganizationSettings,
} from "@/lib/organization-settings";

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useOrganizationSettings(organizationId: string | null) {
  return useQuery({
    queryKey: ["organization-settings", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("get_organization_settings", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return normalizeOrganizationSettings(data);
    },
  });
}

export function useUpdateOrganizationSettings(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<OrganizationSettings>) => {
      const { data, error } = await rpc.rpc("update_organization_settings", {
        _organization_id: organizationId,
        _changes: values,
      });
      if (error) throw error;
      return normalizeOrganizationSettings(data);
    },
    onSuccess: (data) => client.setQueryData(["organization-settings", organizationId], data),
  });
}
