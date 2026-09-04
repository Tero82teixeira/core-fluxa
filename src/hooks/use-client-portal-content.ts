import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { DocumentStatus } from "@/lib/documents";
import type { ProcessStage } from "@/lib/domain";

export type ClientPortalShareItem = {
  item_type: "process" | "document";
  item_id: string;
  title: string;
  subtitle: string;
  status: string;
  is_shared: boolean;
  updated_at: string;
};

export type ClientPortalProcess = {
  access_id: string;
  process_id: string;
  code: string;
  title: string;
  stage: ProcessStage;
  protocol: string | null;
  opened_at: string;
  due_date: string | null;
  updated_at: string;
};

export type ClientPortalDocument = {
  access_id: string;
  document_id: string;
  title: string;
  original_file_name: string;
  file_path: string;
  file_extension: string;
  mime_type: string;
  file_size: number;
  status: DocumentStatus;
  expiration_date: string | null;
  created_at: string;
  process_code: string | null;
};

const shareKey = (organizationId: string | null, clientId: string) => [
  "client-portal-shares",
  organizationId,
  clientId,
];

export function useClientPortalShareManagement(
  organizationId: string | null,
  clientId: string,
  enabled = true,
) {
  return useQuery({
    enabled: enabled && Boolean(organizationId && clientId),
    queryKey: shareKey(organizationId, clientId),
    queryFn: async (): Promise<ClientPortalShareItem[]> => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const { data, error } = await supabase.rpc("client_portal_share_management", {
        _organization_id: organizationId,
        _client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as ClientPortalShareItem[];
    },
  });
}

export function useSetClientPortalItemShared(organizationId: string | null, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemType,
      itemId,
      shared,
    }: {
      itemType: "process" | "document";
      itemId: string;
      shared: boolean;
    }) => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const { error } = await supabase.rpc("set_client_portal_item_shared", {
        _organization_id: organizationId,
        _client_id: clientId,
        _item_type: itemType,
        _item_id: itemId,
        _shared: shared,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: shareKey(organizationId, clientId) }),
  });
}

export function useClientPortalProcesses(enabled: boolean, identityScope: string | null) {
  return useQuery({
    enabled: enabled && Boolean(identityScope),
    queryKey: ["client-portal-processes", identityScope],
    queryFn: async (): Promise<ClientPortalProcess[]> => {
      const { data, error } = await supabase.rpc("client_portal_processes");
      if (error) throw error;
      return (data ?? []) as ClientPortalProcess[];
    },
  });
}

export function useClientPortalDocuments(enabled: boolean, identityScope: string | null) {
  return useQuery({
    enabled: enabled && Boolean(identityScope),
    queryKey: ["client-portal-documents", identityScope],
    queryFn: async (): Promise<ClientPortalDocument[]> => {
      const { data, error } = await supabase.rpc("client_portal_documents");
      if (error) throw error;
      return (data ?? []) as ClientPortalDocument[];
    },
  });
}

export async function createClientPortalDocumentUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from("organization-documents")
    .createSignedUrl(filePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
