import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SupportPriority = "baixa" | "normal" | "alta";
export type SupportStatus =
  "aberto" | "em_analise" | "aguardando_usuario" | "resolvido" | "arquivado";
export type SupportRequest = {
  id: string;
  organization_id: string;
  created_by: string;
  assigned_to: string | null;
  subject: string;
  category: string;
  description: string;
  priority: SupportPriority;
  status: SupportStatus;
  related_module: string | null;
  related_route: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  archived_at: string | null;
};
export type SupportMessage = {
  id: string;
  author_kind: "customer" | "platform";
  author_name: string;
  message: string;
  created_at: string;
};
export function useSupportRequests(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["support-requests", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("support_requests")
        .select("*")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportRequest[];
    },
  });
}
function useRefresh(organizationId: string | null) {
  const q = useQueryClient();
  return () => q.invalidateQueries({ queryKey: ["support-requests", organizationId] });
}
export function useCreateSupportRequest(organizationId: string | null) {
  const refresh = useRefresh(organizationId);
  return useMutation({
    mutationFn: async (v: {
      subject: string;
      category: string;
      description: string;
      priority: SupportPriority;
      relatedModule?: string | null;
      relatedRoute?: string | null;
    }) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await supabase.rpc("create_support_request", {
        _organization_id: organizationId,
        _subject: v.subject,
        _category: v.category,
        _description: v.description,
        _priority: v.priority,
        ...(v.relatedModule ? { _related_module: v.relatedModule } : {}),
        ...(v.relatedRoute ? { _related_route: v.relatedRoute } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: refresh,
  });
}
export function useUpdateSupportStatus(organizationId: string | null) {
  const refresh = useRefresh(organizationId);
  return useMutation({
    mutationFn: async (v: { id: string; status: SupportStatus }) => {
      const { error } = await supabase.rpc("update_support_request_status", {
        _request_id: v.id,
        _status: v.status,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}
export function useAssignSupportRequest(organizationId: string | null) {
  const refresh = useRefresh(organizationId);
  return useMutation({
    mutationFn: async (v: { id: string; assignedTo: string | null }) => {
      const { error } = await supabase.rpc("assign_support_request", {
        _request_id: v.id,
        _assigned_to: v.assignedTo as string,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}
export function useArchiveSupportRequest(organizationId: string | null) {
  const refresh = useRefresh(organizationId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("archive_support_request", { _request_id: id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useSupportRequestThread(requestId: string | null) {
  return useQuery({
    enabled: Boolean(requestId),
    queryKey: ["support-request-thread", requestId],
    queryFn: async () => {
      if (!requestId) return [];
      const { data, error } = await supabase.rpc("support_request_thread", {
        _request_id: requestId,
      });
      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
  });
}

export function useReplySupportRequest(organizationId: string | null, requestId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      message,
      nextStatus,
    }: {
      message: string;
      nextStatus?: SupportStatus | null;
    }) => {
      if (!requestId) throw new Error("SUPPORT_REQUEST_REQUIRED");
      const { data, error } = await supabase.rpc("reply_support_request", {
        _request_id: requestId,
        _message: message,
        ...(nextStatus ? { _next_status: nextStatus } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["support-request-thread", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["support-requests", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["platform-support-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["platform-support-open-count"] }),
      ]);
    },
  });
}
