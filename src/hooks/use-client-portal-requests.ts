import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { DOCUMENTS_BUCKET } from "@/lib/documents";

export type ClientPortalRequestStatus = "pending" | "submitted" | "completed" | "cancelled";

export type ClientPortalDocumentRequest = {
  access_id?: string;
  request_id: string;
  organization_name?: string;
  client_name?: string;
  process_id?: string | null;
  process_code: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: ClientPortalRequestStatus;
  submitted_document_id: string | null;
  submitted_file_name: string | null;
  submitted_at: string | null;
  created_at: string;
};

const managementKey = (organizationId: string | null, clientId: string) => [
  "client-portal-document-requests-management",
  organizationId,
  clientId,
];

export function useManageClientPortalDocumentRequests(
  organizationId: string | null,
  clientId: string,
) {
  return useQuery({
    enabled: Boolean(organizationId && clientId),
    queryKey: managementKey(organizationId, clientId),
    queryFn: async (): Promise<ClientPortalDocumentRequest[]> => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const { data, error } = await supabase.rpc("manage_client_portal_document_requests", {
        _organization_id: organizationId,
        _client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as ClientPortalDocumentRequest[];
    },
  });
}

export function useCreateClientPortalDocumentRequest(
  organizationId: string | null,
  clientId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string | null;
      dueDate: string | null;
      processId: string | null;
    }) => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const { data, error } = await supabase.rpc("create_client_portal_document_request", {
        _organization_id: organizationId,
        _client_id: clientId,
        _process_id: input.processId ?? undefined,
        _title: input.title,
        _description: input.description ?? undefined,
        _due_date: input.dueDate ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: managementKey(organizationId, clientId) }),
  });
}

export function useSetClientPortalDocumentRequestStatus(
  organizationId: string | null,
  clientId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; status: "completed" | "cancelled" }) => {
      const { error } = await supabase.rpc("set_client_portal_document_request_status", {
        _request_id: input.requestId,
        _status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: managementKey(organizationId, clientId) }),
      queryClient.invalidateQueries({ queryKey: ["client-portal-shares", organizationId, clientId] }),
    ]),
  });
}

export function useClientPortalDocumentRequests(enabled: boolean, identityScope: string | null) {
  return useQuery({
    enabled: enabled && Boolean(identityScope),
    queryKey: ["client-portal-document-requests", identityScope],
    queryFn: async (): Promise<ClientPortalDocumentRequest[]> => {
      const { data, error } = await supabase.rpc("client_portal_document_requests");
      if (error) throw error;
      return (data ?? []) as ClientPortalDocumentRequest[];
    },
  });
}

export function useSubmitClientPortalDocument(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, file }: { requestId: string; file: File }) => {
      const { data: prepared, error: prepareError } = await supabase.rpc(
        "prepare_client_portal_document_upload",
        {
          _request_id: requestId,
          _original_file_name: file.name,
          _mime_type: file.type,
          _file_size: file.size,
        },
      );
      if (prepareError) throw prepareError;
      const intent = prepared?.[0];
      if (!intent) throw new Error("Não foi possível preparar o envio.");

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(intent.file_path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: finalizeError } = await supabase.rpc(
        "finalize_client_portal_document_upload",
        { _upload_intent_id: intent.upload_intent_id },
      );
      if (finalizeError) {
        await supabase.storage.from(DOCUMENTS_BUCKET).remove([intent.file_path]);
        throw finalizeError;
      }
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["client-portal-document-requests", identityScope] }),
      queryClient.invalidateQueries({ queryKey: ["client-portal-documents", identityScope] }),
    ]),
  });
}
