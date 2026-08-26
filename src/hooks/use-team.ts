import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { useActor } from "@/hooks/use-mutations";
import type { AppRole } from "@/lib/domain";

const db = () => supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args?: any) => any };

export type TeamMember = {
  id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  full_name: string | null;
  email: string | null;
  distribution_sector: string | null;
  distribution_function: string | null;
  automatic_task_capacity: number;
  receives_automatic_tasks: boolean;
  last_automatic_task_at: string | null;
  openTasks: number;
  lateTasks: number;
  openProcesses: number;
  monitoringItems: number;
};

/** Membros da empresa com carga de trabalho real. */
export function useTeamMembers(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["team-members", organizationId],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await db()
        .from("organization_members")
        .select("id, user_id, role, is_active, created_at, distribution_sector, distribution_function, automatic_task_capacity, receives_automatic_tasks, last_automatic_task_at")
        .eq("organization_id", organizationId)
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as Omit<TeamMember, "full_name" | "email" | "openTasks" | "lateTasks" | "openProcesses">[];
      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.user_id);
      const [{ data: profiles }, { data: tasks }, { data: processes }, { data: monitoring }] = await Promise.all([
        db().from("profiles").select("id, full_name, email").in("id", ids),
        db()
          .from("tasks")
          .select("assignee_id, status, due_at")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .is("archived_at", null)
          .in("status", ["pendente", "em_andamento", "aguardando"]),
        db()
          .from("processes")
          .select("owner_id")
          .eq("organization_id", organizationId)
          .is("archived_at", null),
        db().from("monitoring_items").select("responsible_user_id").eq("organization_id", organizationId).is("archived_at", null),
      ]);

      const profileMap = new Map<string, { full_name: string | null; email: string | null }>(
        (profiles ?? []).map((p: any) => [p.id as string, { full_name: p.full_name ?? null, email: p.email ?? null }]),
      );
      const now = Date.now();
      return rows.map((row) => {
        const own = (tasks ?? []).filter((task: any) => task.assignee_id === row.user_id);
        return {
          ...row,
          full_name: profileMap.get(row.user_id)?.full_name ?? null,
          email: profileMap.get(row.user_id)?.email ?? null,
          openTasks: own.length,
          lateTasks: own.filter((task: any) => task.due_at && new Date(task.due_at).getTime() < now).length,
          openProcesses: (processes ?? []).filter((process: any) => process.owner_id === row.user_id).length,
          monitoringItems: (monitoring ?? []).filter((item: any) => item.responsible_user_id === row.user_id).length,
        };
      });
    },
  });
}

export type InvitationRow = {
  id: string;
  email: string;
  role: AppRole;
  status: string;
  expires_at: string;
  invited_by_name: string | null;
  created_at: string;
  accepted_at: string | null;
};

export function useInvitations(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["invitations", organizationId],
    queryFn: async (): Promise<InvitationRow[]> => {
      const { data, error } = await db()
        .from("organization_invitations")
        .select("id, email, role, status, expires_at, invited_by_name, created_at, accepted_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as InvitationRow[];
    },
  });
}

const invalidateTeam = (queryClient: ReturnType<typeof useQueryClient>, organizationId: string | null) => {
  queryClient.invalidateQueries({ queryKey: ["team-members", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["invitations", organizationId] });
};

/** Cria um convite diretamente pela RPC segura e devolve o link uma única vez. */
export function useCreateInvitation(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AppRole }) => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");

      const { data, error } = await db().rpc("create_invitation", {
        _org: organizationId,
        _email: email,
        _role: role,
      });
      if (error) throw error;

      const invitation = (Array.isArray(data) ? data[0] : data) as {
        invitation_id?: string;
        token?: string;
        expires_at?: string;
      } | null;

      if (!invitation?.invitation_id || !invitation.token || !invitation.expires_at) {
        throw new Error("Não foi possível gerar o link do convite.");
      }
      if (typeof window === "undefined") {
        throw new Error("Não foi possível identificar o endereço da aplicação.");
      }

      return {
        invitation_id: invitation.invitation_id,
        expires_at: invitation.expires_at,
        invitation_url: new URL(`/convite/${encodeURIComponent(invitation.token)}`, window.location.origin).toString(),
        email_sent: false,
        message: "Convite criado. Copie e compartilhe o link.",
      };
    },
    onSuccess: () => invalidateTeam(queryClient, organizationId),
  });
}

export function useCancelInvitation(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await db().rpc("cancel_invitation", { _invitation: invitationId });
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "invite.cancelled",
        entity: "member",
        entityId: invitationId,
      });
    },
    onSuccess: () => invalidateTeam(queryClient, organizationId),
  });
}

export function useChangeMemberRole(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: AppRole }) => {
      const { error } = await db().rpc("change_member_role", { _member: memberId, _role: role });
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "member.role_changed",
        entity: "member",
        entityId: memberId,
        metadata: { role },
      });
    },
    onSuccess: () => invalidateTeam(queryClient, organizationId),
  });
}

export function useUpdateMemberTaskDistribution(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      memberId,
      sector,
      operationalFunction,
      capacity,
      enabled,
    }: {
      memberId: string;
      sector: string;
      operationalFunction: string;
      capacity: number;
      enabled: boolean;
    }) => {
      const { error } = await db().rpc("update_member_task_distribution", {
        _member: memberId,
        _sector: sector,
        _function: operationalFunction,
        _capacity: capacity,
        _receives_automatic_tasks: enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTeam(queryClient, organizationId),
  });
}

export function useSetMemberActive(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ memberId, active }: { memberId: string; active: boolean }) => {
      const { error } = await db().rpc("set_member_active", { _member: memberId, _active: active });
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: active ? "member.reactivated" : "member.deactivated",
        entity: "member",
        entityId: memberId,
      });
    },
    onSuccess: () => invalidateTeam(queryClient, organizationId),
  });
}

/** Transfere tarefas, processos e monitoramentos abertos de um membro para outro. */
export function useTransferResponsibilities(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ fromUserId, toUserId }: { fromUserId: string; toUserId: string }) => {
      const { data, error } = await db().rpc("transfer_member_responsibilities", {
        _org: organizationId,
        _from: fromUserId,
        _to: toUserId,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as {
        tasks_moved: number;
        processes_moved: number;
        monitoring_moved: number;
      };
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "member.responsibilities_transferred",
        entity: "member",
        entityId: fromUserId,
        metadata: { to: toUserId, ...row },
      });
      return row;
    },
    onSuccess: () => {
      invalidateTeam(queryClient, organizationId);
      queryClient.invalidateQueries({ queryKey: ["task-list", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["processes", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["monitoring", organizationId] });
    },
  });
}
