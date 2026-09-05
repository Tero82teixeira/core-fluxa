import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { CommunicationStatus } from "@/lib/communication";

export type ClientPortalCommunicationManagementRow = {
  thread_id: string;
  subject: string;
  status: CommunicationStatus;
  is_shared: boolean;
  opened_by_client: boolean;
  last_public_message_at: string | null;
  updated_at: string;
};

export type ClientPortalCommunicationThread = {
  access_id: string;
  thread_id: string;
  organization_name: string;
  client_name: string;
  subject: string;
  status: CommunicationStatus;
  last_message: string | null;
  last_message_at: string | null;
  updated_at: string;
};

export type ClientPortalCommunicationEntry = {
  entry_id: string;
  content: string;
  author_kind: "client" | "company";
  occurred_at: string;
};

const managementKey = (organizationId: string | null, clientId: string) => [
  "client-portal-communication-management",
  organizationId,
  clientId,
];

const threadsKey = (identityScope: string | null) => [
  "client-portal-communication-threads",
  identityScope,
];

export function useClientPortalCommunicationManagement(
  organizationId: string | null,
  clientId: string,
) {
  return useQuery({
    enabled: Boolean(organizationId && clientId),
    queryKey: managementKey(organizationId, clientId),
    queryFn: async (): Promise<ClientPortalCommunicationManagementRow[]> => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const { data, error } = await supabase.rpc("client_portal_communication_management", {
        _organization_id: organizationId,
        _client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as ClientPortalCommunicationManagementRow[];
    },
  });
}

export function useSetClientPortalCommunicationShared(
  organizationId: string | null,
  clientId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, shared }: { threadId: string; shared: boolean }) => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const { error } = await supabase.rpc("set_client_portal_communication_shared", {
        _organization_id: organizationId,
        _client_id: clientId,
        _thread_id: threadId,
        _shared: shared,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: managementKey(organizationId, clientId) }),
  });
}

export function useClientPortalCommunicationThreads(
  enabled: boolean,
  identityScope: string | null,
) {
  return useQuery({
    enabled: enabled && Boolean(identityScope),
    queryKey: threadsKey(identityScope),
    refetchInterval: 30_000,
    queryFn: async (): Promise<ClientPortalCommunicationThread[]> => {
      const { data, error } = await supabase.rpc("client_portal_communication_threads");
      if (error) throw error;
      return (data ?? []) as ClientPortalCommunicationThread[];
    },
  });
}

export function useClientPortalCommunicationEntries(
  threadId: string | null,
  identityScope: string | null,
) {
  return useQuery({
    enabled: Boolean(threadId && identityScope),
    queryKey: ["client-portal-communication-entries", identityScope, threadId],
    refetchInterval: 15_000,
    queryFn: async (): Promise<ClientPortalCommunicationEntry[]> => {
      if (!threadId) return [];
      const { data, error } = await supabase.rpc("client_portal_communication_entries", {
        _thread_id: threadId,
      });
      if (error) throw error;
      return (data ?? []) as ClientPortalCommunicationEntry[];
    },
  });
}

export function useCreateClientPortalCommunicationThread(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accessId,
      subject,
      content,
    }: {
      accessId: string;
      subject: string;
      content: string;
    }) => {
      const { data, error } = await supabase.rpc("create_client_portal_communication_thread", {
        _access_id: accessId,
        _subject: subject,
        _content: content,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: threadsKey(identityScope) }),
  });
}

export function useAddClientPortalCommunicationEntry(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, content }: { threadId: string; content: string }) => {
      const { error } = await supabase.rpc("add_client_portal_communication_entry", {
        _thread_id: threadId,
        _content: content,
      });
      if (error) throw error;
    },
    onSuccess: (_, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: threadsKey(identityScope) }),
        queryClient.invalidateQueries({
          queryKey: ["client-portal-communication-entries", identityScope, input.threadId],
        }),
      ]),
  });
}
