import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CommunicationChannel, CommunicationEntryType, CommunicationPriority, CommunicationStatus } from "@/lib/communication";

const db = () => supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args?: any) => any };
export type CommunicationThread = {
  id: string; organization_id: string; client_id: string; subject: string; channel: CommunicationChannel; status: CommunicationStatus;
  priority: CommunicationPriority; assigned_to: string | null; process_id: string | null; task_id: string | null; follow_up_at: string | null;
  created_by: string; created_at: string; updated_at: string; archived_at: string | null;
  clients: { id: string; name: string } | null; processes: { id: string; code: string } | null; tasks: { id: string; title: string } | null;
};
export type CommunicationEntry = { id: string; organization_id: string; thread_id: string; entry_type: CommunicationEntryType; content: string; created_by: string; occurred_at: string; is_internal: boolean; contact_made: boolean; metadata: Record<string, unknown>; created_at: string };
export type NewCommunicationThread = { clientId: string; subject: string; channel: CommunicationChannel; assignedTo?: string | null; priority: CommunicationPriority; processId?: string | null; taskId?: string | null; firstContent?: string | null; followUpAt?: string | null };

export function useCommunicationThreads(organizationId: string | null) {
  return useQuery({ enabled: Boolean(organizationId), queryKey: ["communication-threads", organizationId], refetchInterval: 30_000, queryFn: async () => {
    const { data, error } = await db().from("communication_threads").select("id, organization_id, client_id, subject, channel, status, priority, assigned_to, process_id, task_id, follow_up_at, created_by, created_at, updated_at, archived_at, clients(id,name), processes(id,code), tasks(id,title)").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(500);
    if (error) throw error; return (data ?? []) as CommunicationThread[];
  }});
}
export function useCommunicationEntries(threadId: string | null) {
  return useQuery({ enabled: Boolean(threadId), queryKey: ["communication-entries", threadId], refetchInterval: 15_000, queryFn: async () => {
    const { data, error } = await db().from("communication_entries").select("id, organization_id, thread_id, entry_type, content, created_by, occurred_at, is_internal, contact_made, metadata, created_at").eq("thread_id", threadId).order("occurred_at").order("created_at");
    if (error) throw error; return (data ?? []) as CommunicationEntry[];
  }});
}
export function useCommunicationSearchIndex(organizationId: string | null) {
  return useQuery({ enabled: Boolean(organizationId), queryKey: ["communication-search", organizationId], queryFn: async () => {
    const { data, error } = await db().from("communication_entries").select("thread_id, content").eq("organization_id", organizationId).limit(3000);
    if (error) throw error;
    const index = new Map<string, string>();
    for (const row of data ?? []) index.set(row.thread_id, `${index.get(row.thread_id) ?? ""} ${row.content}`);
    return index;
  }});
}
function useRefresh(organizationId: string | null) { const client = useQueryClient(); return (threadId?: string) => { client.invalidateQueries({ queryKey: ["communication-threads", organizationId] }); client.invalidateQueries({ queryKey: ["communication-search", organizationId] }); if (threadId) client.invalidateQueries({ queryKey: ["communication-entries", threadId] }); }; }
export function useCreateCommunicationThread(organizationId: string | null) { const refresh = useRefresh(organizationId); return useMutation({ mutationFn: async (v: NewCommunicationThread) => { const { data, error } = await db().rpc("create_communication_thread", { _organization_id: organizationId, _client_id: v.clientId, _subject: v.subject, _channel: v.channel, _assigned_to: v.assignedTo || null, _priority: v.priority, _process_id: v.processId || null, _task_id: v.taskId || null, _first_content: v.firstContent || null, _follow_up_at: v.followUpAt || null }); if (error) throw error; return data as string; }, onSuccess: () => refresh() }); }
export function useAddCommunicationEntry(organizationId: string | null) { const refresh = useRefresh(organizationId); const client = useQueryClient(); return useMutation({ mutationFn: async (v: { threadId: string; type: CommunicationEntryType; content: string; occurredAt?: string; internal?: boolean; contactMade?: boolean; metadata?: Record<string, unknown> }) => { const { error } = await db().rpc("add_communication_entry", { _thread_id: v.threadId, _entry_type: v.type, _content: v.content, _occurred_at: v.occurredAt || new Date().toISOString(), _is_internal: Boolean(v.internal), _contact_made: Boolean(v.contactMade), _metadata: v.metadata ?? {} }); if (error) throw error; }, onSuccess: (_, v) => { refresh(v.threadId); client.invalidateQueries({ queryKey: ["clients"] }); client.invalidateQueries({ queryKey: ["clients-page"] }); client.invalidateQueries({ queryKey: ["client"] }); } }); }
export function useChangeCommunicationStatus(organizationId: string | null) { const refresh = useRefresh(organizationId); return useMutation({ mutationFn: async ({ threadId, status }: { threadId: string; status: CommunicationStatus }) => { const { error } = await db().rpc("change_communication_thread_status", { _thread_id: threadId, _status: status }); if (error) throw error; }, onSuccess: (_, v) => refresh(v.threadId) }); }
export function useAssignCommunicationThread(organizationId: string | null) { const refresh = useRefresh(organizationId); return useMutation({ mutationFn: async ({ threadId, assignedTo }: { threadId: string; assignedTo: string | null }) => { const { error } = await db().rpc("assign_communication_thread", { _thread_id: threadId, _assigned_to: assignedTo }); if (error) throw error; }, onSuccess: (_, v) => refresh(v.threadId) }); }
export function useUpdateCommunicationThread(organizationId: string | null) { const refresh = useRefresh(organizationId); return useMutation({ mutationFn: async ({ threadId, processId, taskId, followUpAt, clearFollowUp = false }: { threadId: string; processId?: string | null; taskId?: string | null; followUpAt?: string | null; clearFollowUp?: boolean }) => { const { error } = await db().rpc("update_communication_thread", { _thread_id: threadId, _process_id: processId ?? null, _process_id_provided: processId !== undefined, _task_id: taskId ?? null, _task_id_provided: taskId !== undefined, _follow_up_at: followUpAt || null, _clear_follow_up: clearFollowUp }); if (error) throw error; }, onSuccess: (_, v) => refresh(v.threadId) }); }
