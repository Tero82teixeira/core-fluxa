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

export type WebhookEvent = {
  event_record_id: string;
  provider: "asaas" | "kiwify" | "whatsapp" | "email";
  event_type: string;
  reference: string;
  status: "processed" | "pending" | "attention" | "ignored" | "failed";
  diagnostic_code: string | null;
  received_at: string;
  processed_at: string | null;
  replayable: boolean;
};

export type IntegrationCredential = {
  integration_key: string;
  label: string;
  status: "healthy" | "attention" | "stale" | "not_configured";
  last_validated_at: string | null;
  days_since_validation: number | null;
  diagnostic_code: string | null;
  action_url: string;
};

export type IntegrationReportItem = {
  provider: string;
  label: string;
  total_count: number;
  processed_count: number;
  warning_count: number;
  failed_count: number;
  success_rate: number;
  last_event_at: string | null;
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

export function useWebhookEvents(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId && enabled),
    queryKey: ["integration-webhook-events", organizationId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_webhook_events", {
        _organization_id: organizationId!,
        _limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as WebhookEvent[];
    },
  });
}

export function useIntegrationCredentials(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId && enabled),
    queryKey: ["integration-credentials", organizationId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_integration_credentials", {
        _organization_id: organizationId!,
      });
      if (error) throw error;
      return (data ?? []) as IntegrationCredential[];
    },
  });
}

export function useIntegrationReport(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId && enabled),
    queryKey: ["integration-report", organizationId, "30-days"],
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase.rpc("organization_integration_report", {
        _organization_id: organizationId!,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) throw error;
      return (data ?? []).map((item) => ({
        ...item,
        success_rate: Number(item.success_rate),
      })) as IntegrationReportItem[];
    },
  });
}

export function useReplayAsaasWebhook(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (webhookEventId: string) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      return invoke("asaas-connector", {
        action: "replay_webhook_event",
        organizationId,
        webhookEventId,
      });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["integration-webhook-events", organizationId] });
      void client.invalidateQueries({ queryKey: ["integration-report", organizationId] });
      void client.invalidateQueries({ queryKey: ["integration-health", organizationId] });
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
