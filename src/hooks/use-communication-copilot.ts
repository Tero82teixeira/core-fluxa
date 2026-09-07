import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseCommunicationCopilotResponse } from "@/lib/communication-copilot";

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function enabledFrom(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).enabled === true,
  );
}

export function useCommunicationCopilotSettings(organizationId: string | null) {
  return useQuery({
    queryKey: ["communication-copilot-settings", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("get_communication_copilot_settings", {
        _organization_id: organizationId,
      });
      if (error) throw new Error(error.message || "COPILOT_SETTINGS_ERROR");
      return enabledFrom(data);
    },
  });
}

export function useUpdateCommunicationCopilotSettings(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await rpc.rpc("update_communication_copilot_settings", {
        _organization_id: organizationId,
        _enabled: enabled,
      });
      if (error) throw new Error(error.message || "COPILOT_SETTINGS_ERROR");
      return enabledFrom(data);
    },
    onSuccess: (enabled) =>
      client.setQueryData(["communication-copilot-settings", organizationId], enabled),
  });
}

export function useCommunicationCopilot() {
  return useMutation({
    mutationFn: async ({
      threadId,
      mode,
      draft,
    }: {
      threadId: string;
      mode: "assist" | "review";
      draft?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("communication-copilot", {
        body: { threadId, mode, draft },
      });
      if (error) {
        const context = (error as { context?: unknown }).context;
        if (context instanceof Response) {
          try {
            const payload = (await context.clone().json()) as { error?: unknown };
            if (payload.error) throw new Error(String(payload.error));
          } catch (responseError) {
            if (
              responseError instanceof Error &&
              responseError.message !== "Unexpected end of JSON input"
            )
              throw responseError;
          }
        }
        throw error;
      }
      if (data?.error) throw new Error(String(data.error));
      return parseCommunicationCopilotResponse(data);
    },
  });
}
