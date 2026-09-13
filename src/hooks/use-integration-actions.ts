import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type IntegrationFailure = {
  failure_id: string;
  integration_key: string;
  label: string;
  description: string;
  error_code: string;
  failed_at: string;
  attempts: number;
  retryable: boolean;
};

async function invoke(functionName: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const payload = (await context
        .clone()
        .json()
        .catch(() => null)) as { error?: unknown } | null;
      if (payload?.error) throw new Error(String(payload.error));
    }
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export function useIntegrationFailures(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId && enabled),
    queryKey: ["integration-failures", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_integration_failures", {
        _organization_id: organizationId!,
      });
      if (error) throw error;
      return (data ?? []) as IntegrationFailure[];
    },
  });
}

export function useTestIntegrationConnection(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (integrationKey: string) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      if (integrationKey === "asaas") {
        return invoke("asaas-connector", {
          action: "test_connection",
          organizationId,
        });
      }
      if (integrationKey === "channel-whatsapp" || integrationKey === "channel-email") {
        return invoke("communication-channel-send", {
          mode: "test_connection",
          organizationId,
          channel: integrationKey === "channel-whatsapp" ? "whatsapp" : "email",
        });
      }
      if (integrationKey === "push") {
        return invoke("communication-push", { mode: "test", organizationId });
      }
      if (integrationKey === "copilot") {
        return invoke("communication-copilot", { mode: "health", organizationId });
      }
      throw new Error("INTEGRATION_TEST_NOT_AVAILABLE");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["integration-health", organizationId] });
      void client.invalidateQueries({ queryKey: ["integration-failures", organizationId] });
    },
  });
}
