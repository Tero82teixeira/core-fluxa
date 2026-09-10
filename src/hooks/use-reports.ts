import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchOperationalMonitoring } from "@/hooks/use-monitoring-center";

const db = () => supabase as unknown as { from: (table: string) => any };
const LIMIT = 1000;
async function rows(table: string, select: string, organizationId: string) {
  const { data, error } = await db().from(table).select(select).eq("organization_id", organizationId).limit(LIMIT);
  if (error) throw error;
  return data ?? [];
}

/** Fonte única dos relatórios. O RLS ainda determina quais linhas o papel atual pode ler. */
export function useReportData(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["reports", organizationId],
    staleTime: 60_000,
    queryFn: async () => {
      if (!organizationId) throw new Error("Selecione uma organização ativa para consultar relatórios.");
      const [clients, tasks, processes, documents, monitoring, members, goals, movements, communications, opportunities, opportunityMovements, memberGoals] = await Promise.all([
        rows("clients_secure", "id,name,status,city,state,owner_id,owner_name,last_interaction_at,created_at,archived_at", organizationId),
        rows("tasks", "id,title,status,priority,due_at,completed_at,created_at,assignee_id,assignee_name,client_id,process_id,archived_at,deleted_at", organizationId),
        rows("processes", "id,code,title,stage,priority,owner_id,owner_name,client_id,opened_at,due_date,last_movement_at,value,financial_status,updated_at,archived_at", organizationId),
        rows("documents", "id,title,status,expiration_date,created_at,client_id,process_id,uploaded_by_name,archived_at", organizationId),
        fetchOperationalMonitoring(organizationId),
        rows("organization_members", "id,user_id,role,is_active,created_at,automatic_task_capacity,portal_communication_capacity", organizationId),
        rows("organization_performance_goals", "goal_month,new_clients_target,completed_tasks_target,completed_processes_target,updated_at", organizationId),
        rows("process_movements", "id,process_id,to_stage,created_at", organizationId),
        rows("communication_threads", "id,client_id,process_id,subject,status,priority,assigned_to,follow_up_at,created_at,archived_at", organizationId),
        rows("commercial_opportunities", "id,client_id,title,stage,estimated_value,probability,owner_id,next_action_at,lost_reason,won_at,lost_at,created_at,updated_at,archived_at", organizationId),
        rows("commercial_opportunity_stage_history", "id,opportunity_id,from_stage,to_stage,changed_by,changed_at", organizationId),
        rows("member_performance_goals", "user_id,goal_month,completed_tasks_target,completed_processes_target,updated_at", organizationId),
      ]);
      const memberIds = members.map((member: any) => member.user_id);
      const { data: profiles, error: profilesError } = memberIds.length
        ? await db().from("profiles").select("id,full_name,email").in("id", memberIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
      const namedMembers = members.map((member: any) => ({ ...member, ...(profileMap.get(member.user_id) ?? {}) }));
      const memberNameMap = new Map(namedMembers.map((member: any) => [member.user_id, member.full_name || member.email || "Membro sem nome"]));
      const namedCommunications = communications.map((thread: any) => ({ ...thread, assigned_name: thread.assigned_to ? memberNameMap.get(thread.assigned_to) ?? null : null }));
      const namedOpportunities = opportunities.map((opportunity: any) => ({ ...opportunity, owner_name: opportunity.owner_id ? memberNameMap.get(opportunity.owner_id) ?? null : null }));
      return { clients, tasks, processes, documents, monitoring, members: namedMembers, goals, movements, communications: namedCommunications, opportunities: namedOpportunities, opportunityMovements, memberGoals };
    },
  });
}

export function useCommercialOpportunityAlerts(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["commercial-opportunity-alerts", organizationId],
    staleTime: 60_000,
    queryFn: async () => {
      if (!organizationId) return [];
      const data = await rows(
        "commercial_opportunities",
        "id,title,stage,estimated_value,owner_id,next_action_at,archived_at",
        organizationId,
      );
      return data.filter((row: any) => !row.archived_at && !["won", "lost"].includes(row.stage));
    },
  });
}

export function useSetPerformanceGoals(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      goalMonth: string;
      newClientsTarget: number;
      completedTasksTarget: number;
      completedProcessesTarget: number;
    }) => {
      if (!organizationId) throw new Error("Selecione uma organização ativa.");
      const { error } = await (supabase as any).rpc("set_organization_performance_goals", {
        _organization_id: organizationId,
        _goal_month: `${values.goalMonth}-01`,
        _new_clients_target: values.newClientsTarget,
        _completed_tasks_target: values.completedTasksTarget,
        _completed_processes_target: values.completedProcessesTarget,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", organizationId] }),
  });
}

export type CommercialOpportunityInput = {
  id?: string;
  title: string;
  stage: string;
  estimatedValue: number;
  probability: number;
  clientId?: string | null;
  ownerId?: string | null;
  nextActionAt?: string | null;
  lostReason?: string | null;
};

export function useUpsertCommercialOpportunity(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: CommercialOpportunityInput) => {
      if (!organizationId) throw new Error("Selecione uma organização ativa.");
      const { data, error } = await (supabase as any).rpc("upsert_commercial_opportunity", {
        _organization_id: organizationId, _opportunity_id: value.id ?? null, _title: value.title,
        _stage: value.stage, _estimated_value: value.estimatedValue, _probability: value.probability,
        _client_id: value.clientId || null, _owner_id: value.ownerId || null,
        _next_action_at: value.nextActionAt ? new Date(value.nextActionAt).toISOString() : null, _lost_reason: value.lostReason || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", organizationId] }),
  });
}

export function useArchiveCommercialOpportunity(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (opportunityId: string) => {
      if (!organizationId) throw new Error("Selecione uma organização ativa.");
      const { error } = await (supabase as any).rpc("archive_commercial_opportunity", { _organization_id: organizationId, _opportunity_id: opportunityId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", organizationId] }),
  });
}

export function useSetMemberPerformanceGoals(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: { userId: string; goalMonth: string; completedTasksTarget: number; completedProcessesTarget: number }) => {
      if (!organizationId) throw new Error("Selecione uma organização ativa.");
      const { error } = await (supabase as any).rpc("set_member_performance_goals", {
        _organization_id: organizationId, _user_id: value.userId, _goal_month: `${value.goalMonth}-01`,
        _completed_tasks_target: value.completedTasksTarget, _completed_processes_target: value.completedProcessesTarget,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", organizationId] }),
  });
}

export const useReportOverview = useReportData;
export const useTaskReport = useReportData;
export const useProcessReport = useReportData;
export const useClientReport = useReportData;
export const useDocumentReport = useReportData;
export const useMonitoringReport = useReportData;
export const useTeamReport = useReportData;
