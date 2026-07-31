import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { recordAudit, type AuditAction } from "@/lib/audit";
import { digits } from "@/lib/format";
import type {
  AppRole,
  ClientStatus,
  FinancialStatus,
  PriorityLevel,
  ProcessStage,
  TaskStatus,
} from "@/lib/domain";
import { PROCESS_STAGE } from "@/lib/domain";

const db = () => supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args?: any) => any };

/** Identidade do usuário que executa a ação (para created_by/updated_by e auditoria). */
export function useActor() {
  const { organizationId, user, displayName, role } = useWorkspace();
  return { organizationId, userId: user?.id ?? null, name: displayName, role };
}

/* ------------------------------------------------------------------ *
 * Catálogos
 * ------------------------------------------------------------------ */

export function useServiceTypes(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["service-types", organizationId],
    queryFn: async () => {
      const { data, error } = await db()
        .from("service_types")
        .select("id, name, default_days, default_value")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; default_days: number | null; default_value: number | null }[];
    },
  });
}

export type MemberRow = {
  id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  full_name: string | null;
  email: string | null;
};

export function useMembers(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["members", organizationId],
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await db()
        .from("organization_members")
        .select("id, user_id, role, is_active, created_at")
        .eq("organization_id", organizationId)
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as Omit<MemberRow, "full_name" | "email">[];
      if (rows.length === 0) return [];
      const { data: profiles } = await db()
        .from("profiles")
        .select("id, full_name, email")
        .in("id", rows.map((row) => row.user_id));
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return rows.map((row) => ({
        ...row,
        full_name: map.get(row.user_id)?.full_name ?? null,
        email: map.get(row.user_id)?.email ?? null,
      }));
    },
  });
}

export function useUpdateMemberRole(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ memberId, role, userId }: { memberId: string; role: AppRole; userId: string }) => {
      const { error } = await db().from("organization_members").update({ role }).eq("id", memberId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "member.role_changed",
        entity: "member",
        entityId: userId,
        metadata: { role },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", organizationId] }),
  });
}

/* ------------------------------------------------------------------ *
 * Clientes
 * ------------------------------------------------------------------ */

export type ClientInput = {
  person_type: "pf" | "pj";
  name: string;
  trade_name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  state?: string | null;
  status: ClientStatus;
  owner_name?: string | null;
  notes?: string | null;
};

export function useUpdateClient(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<ClientInput> }) => {
      const { error } = await db()
        .from("clients")
        .update({
          ...values,
          document_digits: values.document !== undefined ? digits(values.document ?? "") || null : undefined,
          updated_by: actor.userId,
        })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "client.updated",
        entity: "client",
        entityId: id,
        metadata: { fields: Object.keys(values) },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["clients", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["client", variables.id] });
    },
  });
}

export function useArchiveClient(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db()
        .from("clients")
        .update({ archived_at: new Date().toISOString(), status: "arquivado", updated_by: actor.userId })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "client.archived",
        entity: "client",
        entityId: id,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients", organizationId] }),
  });
}

/* ------------------------------------------------------------------ *
 * Processos
 * ------------------------------------------------------------------ */

export type ProcessInput = {
  client_id: string;
  service_type_id?: string | null;
  title?: string | null;
  description?: string | null;
  stage: ProcessStage;
  priority: PriorityLevel;
  owner_name?: string | null;
  due_date?: string | null;
  protocol?: string | null;
  value?: number | null;
  financial_status: FinancialStatus;
};

export function useCreateProcess(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async (values: ProcessInput) => {
      const { data: code, error: codeError } = await db().rpc("next_process_code", { _org: organizationId });
      if (codeError) throw codeError;
      const nowIso = new Date().toISOString();
      const { data, error } = await db()
        .from("processes")
        .insert({
          ...values,
          code,
          organization_id: organizationId,
          owner_id: actor.userId,
          owner_name: values.owner_name || actor.name,
          created_by: actor.userId,
          updated_by: actor.userId,
          last_movement_at: nowIso,
        })
        .select("id, code")
        .single();
      if (error) throw error;

      await db().from("process_movements").insert({
        organization_id: organizationId,
        process_id: data.id,
        from_stage: null,
        to_stage: values.stage,
        description: "Processo criado.",
        actor_name: actor.name,
        created_by: actor.userId,
      });
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "process.created",
        entity: "process",
        entityId: data.id,
        metadata: { code: data.code },
      });
      return data as { id: string; code: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processes", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["activity", organizationId] });
    },
  });
}

/** Alteração de etapa com registro de movimentação e auditoria. */
export function useMoveProcessStage(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({
      processId,
      from,
      to,
      code,
    }: {
      processId: string;
      from: ProcessStage;
      to: ProcessStage;
      code?: string;
    }) => {
      const nowIso = new Date().toISOString();
      const { error } = await db()
        .from("processes")
        .update({ stage: to, last_movement_at: nowIso, updated_by: actor.userId })
        .eq("id", processId)
        .eq("organization_id", organizationId);
      if (error) throw error;

      const { error: movementError } = await db().from("process_movements").insert({
        organization_id: organizationId,
        process_id: processId,
        from_stage: from,
        to_stage: to,
        description: `Etapa alterada de ${PROCESS_STAGE[from].label} para ${PROCESS_STAGE[to].label}.`,
        actor_name: actor.name,
        created_by: actor.userId,
      });
      if (movementError) throw movementError;

      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "process.stage_changed",
        entity: "process",
        entityId: processId,
        metadata: { from, to, code },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["processes", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["process", variables.processId] });
      queryClient.invalidateQueries({ queryKey: ["process-movements", variables.processId] });
      queryClient.invalidateQueries({ queryKey: ["activity", organizationId] });
    },
  });
}

const PROCESS_FIELD_AUDIT: Partial<Record<keyof ProcessInput, { action: AuditAction; label: string }>> = {
  owner_name: { action: "process.owner_changed", label: "Responsável alterado" },
  due_date: { action: "process.due_changed", label: "Prazo alterado" },
  priority: { action: "process.priority_changed", label: "Prioridade alterada" },
};

export function useUpdateProcess(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<ProcessInput> }) => {
      const nowIso = new Date().toISOString();
      const { error } = await db()
        .from("processes")
        .update({ ...values, updated_by: actor.userId, last_movement_at: nowIso })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      for (const [field, meta] of Object.entries(PROCESS_FIELD_AUDIT)) {
        const key = field as keyof ProcessInput;
        if (values[key] === undefined) continue;
        await db().from("process_movements").insert({
          organization_id: organizationId,
          process_id: id,
          description: `${meta!.label}: ${String(values[key] ?? "—")}.`,
          actor_name: actor.name,
          created_by: actor.userId,
        });
        await recordAudit({
          organizationId: organizationId!,
          actorId: actor.userId,
          actorName: actor.name,
          action: meta!.action,
          entity: "process",
          entityId: id,
          metadata: { [key]: values[key] },
        });
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["processes", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["process", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["process-movements", variables.id] });
    },
  });
}

/* ------------------------------------------------------------------ *
 * Tarefas
 * ------------------------------------------------------------------ */

export type TaskInput = {
  title: string;
  description?: string | null;
  priority: PriorityLevel;
  due_at?: string | null;
  assignee_name?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  status?: TaskStatus;
};

export function useCreateTask(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async (values: TaskInput) => {
      const { data, error } = await db()
        .from("tasks")
        .insert({
          ...values,
          status: values.status ?? "pendente",
          organization_id: organizationId,
          assignee_id: actor.userId,
          assignee_name: values.assignee_name || actor.name,
          created_by: actor.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (values.process_id) {
        await db().from("process_movements").insert({
          organization_id: organizationId,
          process_id: values.process_id,
          description: `Tarefa criada: ${values.title}.`,
          actor_name: actor.name,
          created_by: actor.userId,
        });
      }
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "task.created",
        entity: "task",
        entityId: data.id,
        metadata: { title: values.title },
      });
      return data as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["activity", organizationId] });
    },
  });
}

export function useUpdateTask(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<TaskInput> }) => {
      const { error } = await db()
        .from("tasks")
        .update({ ...values, updated_by: actor.userId })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });
}

export function useSetTaskStatus(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      title,
      processId,
    }: {
      id: string;
      status: TaskStatus;
      title?: string;
      processId?: string | null;
    }) => {
      const done = status === "concluida";
      const { error } = await db()
        .from("tasks")
        .update({ status, completed_at: done ? new Date().toISOString() : null, updated_by: actor.userId })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      if (processId) {
        await db().from("process_movements").insert({
          organization_id: organizationId,
          process_id: processId,
          description: done ? `Tarefa concluída: ${title ?? ""}.` : `Tarefa reaberta: ${title ?? ""}.`,
          actor_name: actor.name,
          created_by: actor.userId,
        });
      }
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: done ? "task.completed" : "task.reopened",
        entity: "task",
        entityId: id,
        metadata: { title },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] });
      if (variables.processId) {
        queryClient.invalidateQueries({ queryKey: ["process-movements", variables.processId] });
      }
      queryClient.invalidateQueries({ queryKey: ["activity", organizationId] });
    },
  });
}

/** Exclusão lógica — o registro nunca sai do banco. */
export function useDeleteTask(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db()
        .from("tasks")
        .update({ deleted_at: new Date().toISOString(), status: "cancelada", updated_by: actor.userId })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "task.deleted",
        entity: "task",
        entityId: id,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });
}

/* ------------------------------------------------------------------ *
 * Histórico do cliente (auditoria)
 * ------------------------------------------------------------------ */

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_name: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export function useEntityHistory(organizationId: string | null, entityId?: string) {
  return useQuery({
    enabled: Boolean(organizationId && entityId),
    queryKey: ["audit", organizationId, entityId],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await db()
        .from("audit_logs")
        .select("id, action, entity, entity_id, actor_name, created_at, metadata")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
}
