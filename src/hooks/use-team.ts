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
  openTasks: number;
  lateTasks: number;
  openProcesses: number;
};

/** Membros da empresa com carga de trabalho real. */
export function useTeamMembers(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["team-members", organizationId],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await db()
        .from("organization_members")
        .select("id, user_id, role, is_active, created_at")
        .eq("organization_id", organizationId)
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as Omit<TeamMember, "full_name" | "email" | "openTasks" | "lateTasks" | "openProcesses">[];
      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.user_id);
      const [{ data: profiles }, { data: tasks }, { data: processes }] = await Promise.all([
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

/** Cria um convite e devolve o link (o token só é exibido uma vez). */
export function useCreateInvitation(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AppRole }) => {
      const { data, error } = await db().rpc("create_invitation", {
        _org: organizationId,
        _email: email,
        _role: role,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { invitation_id: string; token: string; expires_at: string };
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "invite.created",
        entity: "member",
        entityId: row.invitation_id,
        metadata: { email, role },
      });
      return row;
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
