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

export type IntegrationIncident = IntegrationFailure & {
  incident_id: string | null;
  status: "open" | "in_progress" | "resolved";
  assigned_to: string | null;
  assigned_name: string | null;
  updated_at: string;
  is_active_failure: boolean;
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

export type AsaasAutomationStatus = {
  last_run_at: string | null;
  processed_count: number;
  succeeded_count: number;
  failed_count: number;
  queued_count: number;
  next_attempt_at: string | null;
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

export function useIntegrationIncidents(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId && enabled),
    queryKey: ["integration-incidents", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_integration_incidents", {
        _organization_id: organizationId!,
      });
      if (error) throw error;
      return (data ?? []) as IntegrationIncident[];
    },
  });
}

export function useManageIntegrationIncident(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      integrationKey,
      failureId,
      action,
    }: {
      integrationKey: string;
      failureId: string;
      action: "acknowledge" | "resolve" | "reopen";
    }) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { error } = await supabase.rpc("manage_integration_incident", {
        _organization_id: organizationId,
        _integration_key: integrationKey,
        _failure_id: failureId,
        _action: action,
      });
      if (error) throw error;
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["integration-incidents", organizationId] });
      void client.invalidateQueries({ queryKey: ["integration-health", organizationId] });
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

export function useAsaasAutomationStatus(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId && enabled),
    queryKey: ["asaas-automation-status", organizationId],
    refetchInterval: (current) => (current.state.data?.queued_count ? 15_000 : 60_000),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_asaas_automation_status", {
        _organization_id: organizationId!,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as AsaasAutomationStatus | null;
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
      void client.invalidateQueries({ queryKey: ["integration-credentials", organizationId] });
    },
  });
}
