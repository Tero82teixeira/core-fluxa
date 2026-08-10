import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = () =>
  supabase as unknown as { from: (table: string) => any; rpc: (name: string, args?: any) => any };
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
export function useSupportRequests(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["support-requests", organizationId],
    queryFn: async () => {
      const { data, error } = await db()
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
      const { data, error } = await db().rpc("create_support_request", {
        _organization_id: organizationId,
        _subject: v.subject,
        _category: v.category,
        _description: v.description,
        _priority: v.priority,
        _related_module: v.relatedModule || null,
        _related_route: v.relatedRoute || null,
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
      const { error } = await db().rpc("update_support_request_status", {
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
      const { error } = await db().rpc("assign_support_request", {
        _request_id: v.id,
        _assigned_to: v.assignedTo,
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
      const { error } = await db().rpc("archive_support_request", { _request_id: id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}
