import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const db = () => supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type CommunicationResponseAlertSettings = {
  first_reminder_minutes: number;
  escalation_minutes: number;
};

const defaults: CommunicationResponseAlertSettings = {
  first_reminder_minutes: 15,
  escalation_minutes: 30,
};

function normalize(value: unknown): CommunicationResponseAlertSettings {
  const row = (Array.isArray(value) ? value[0] : value) as Partial<CommunicationResponseAlertSettings> | null;
  return {
    first_reminder_minutes:
      typeof row?.first_reminder_minutes === "number" ? row.first_reminder_minutes : defaults.first_reminder_minutes,
    escalation_minutes:
      typeof row?.escalation_minutes === "number" ? row.escalation_minutes : defaults.escalation_minutes,
  };
}

export function useCommunicationResponseAlertSettings(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["communication-response-alert-settings", organizationId],
    queryFn: async () => {
      const { data, error } = await db().rpc("get_communication_response_alert_settings", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return normalize(data);
    },
  });
}

export function useUpdateCommunicationResponseAlertSettings(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (settings: CommunicationResponseAlertSettings) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await db().rpc("update_communication_response_alert_settings", {
        _organization_id: organizationId,
        _first_reminder_minutes: settings.first_reminder_minutes,
        _escalation_minutes: settings.escalation_minutes,
      });
      if (error) throw error;
      return normalize(data);
    },
    onSuccess: (data) =>
      client.setQueryData(["communication-response-alert-settings", organizationId], data),
  });
}
