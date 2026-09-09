import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CommunicationChannelConnection = {
  id: string;
  channel: "whatsapp" | "email";
  provider: "meta_cloud_api" | "resend";
  sender_identifier: string;
  display_name: string;
  status: "pending" | "active" | "paused" | "error";
  is_enabled: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_error_code: string | null;
};

export type UnmatchedChannelMessage = {
  id: string;
  channel: "whatsapp" | "email";
  external_sender: string;
  subject: string | null;
  content: string;
  occurred_at: string;
};

export function useCommunicationChannelConnections(organizationId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["communication-channel-connections", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("list_communication_channel_connections", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CommunicationChannelConnection[];
    },
  });
}

export function useSaveCommunicationChannelConnection(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      channel: "whatsapp" | "email";
      senderIdentifier: string;
      displayName: string;
      isEnabled: boolean;
    }) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await supabase.rpc("save_communication_channel_connection", {
        _organization_id: organizationId,
        _channel: input.channel,
        _sender_identifier: input.senderIdentifier.trim(),
        _display_name: input.displayName.trim(),
        _is_enabled: input.isEnabled,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["communication-channel-connections", organizationId] }),
  });
}

export function useSendCommunicationChannelMessage(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, content }: { threadId: string; content: string }) => {
      const { data, error } = await supabase.functions.invoke("communication-channel-send", {
        body: { threadId, content },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data as { sent: true; providerMessageId: string };
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["communication-threads", organizationId] });
      client.invalidateQueries({ queryKey: ["communication-channel-connections", organizationId] });
    },
  });
}

export function useUnmatchedCommunicationChannelMessages(
  organizationId: string | null,
  enabled = true,
) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["communication-channel-unmatched", organizationId],
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("list_unmatched_communication_channel_messages", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as UnmatchedChannelMessage[];
    },
  });
}

export function useMatchCommunicationChannelMessage(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, clientId }: { messageId: string; clientId: string }) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await supabase.rpc("match_communication_channel_message", {
        _organization_id: organizationId,
        _message_id: messageId,
        _client_id: clientId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["communication-channel-unmatched", organizationId] });
      client.invalidateQueries({ queryKey: ["communication-threads", organizationId] });
    },
  });
}
