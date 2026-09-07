import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type DocumentRequestTemplateItem = {
  title: string;
  description: string;
  due_days: number | null;
};
export type DocumentRequestTemplate = {
  id: string;
  title: string;
  items: DocumentRequestTemplateItem[];
  is_active: boolean;
};
const db = () => supabase as any;

export function useDocumentRequestTemplates(organizationId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["document-request-templates", organizationId],
    queryFn: async (): Promise<DocumentRequestTemplate[]> => {
      if (!organizationId) return [];
      const { data, error } = await db().rpc("list_document_request_templates", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as DocumentRequestTemplate[];
    },
  });
}

export function useSaveDocumentRequestTemplate(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string | null;
      title: string;
      items: DocumentRequestTemplateItem[];
      isActive: boolean;
    }) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await db().rpc("save_document_request_template", {
        _organization_id: organizationId,
        _template_id: input.id ?? null,
        _title: input.title.trim(),
        _items: input.items,
        _is_active: input.isActive,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["document-request-templates", organizationId] }),
  });
}

export function useApplyDocumentRequestTemplate(organizationId: string | null, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      processId: string | null;
      dueDate: string | null;
    }) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await db().rpc("create_document_requests_from_template", {
        _organization_id: organizationId,
        _client_id: clientId,
        _template_id: input.templateId,
        _process_id: input.processId,
        _due_date: input.dueDate,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["client-portal-document-requests-management", organizationId, clientId],
      }),
  });
}
