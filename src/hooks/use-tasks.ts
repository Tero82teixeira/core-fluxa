import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { useActor } from "@/hooks/use-mutations";
import type { PriorityLevel, RecurrenceType, TaskStatus } from "@/lib/domain";

const db = () => supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args?: any) => any };

export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: PriorityLevel;
  start_date: string | null;
  due_at: string | null;
  due_time: string | null;
  reminder_at: string | null;
  recurrence_type: RecurrenceType;
  recurrence_end_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  client_id: string | null;
  process_id: string | null;
  document_id: string | null;
  monitoring_item_id: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  clients: { id: string; name: string } | null;
  processes: { id: string; code: string } | null;
};

const SELECT =
  "id, organization_id, title, description, notes, status, priority, start_date, due_at, due_time, reminder_at, recurrence_type, recurrence_end_date, assignee_id, assignee_name, client_id, process_id, document_id, monitoring_item_id, completed_at, archived_at, created_at, created_by, clients(id, name), processes(id, code)";

export type TaskScope = {
  clientId?: string | null;
  processId?: string | null;
  documentId?: string | null;
  monitoringItemId?: string | null;
};

/** Lista de tarefas da empresa (opcionalmente restrita a um vínculo). */
export function useTaskList(organizationId: string | null, scope?: TaskScope, includeArchived = false) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["task-list", organizationId, scope ?? null, includeArchived],
    queryFn: async (): Promise<TaskRow[]> => {
      let query = db()
        .from("tasks")
        .select(SELECT)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!includeArchived) query = query.is("archived_at", null);
      if (scope?.clientId) query = query.eq("client_id", scope.clientId);
      if (scope?.processId) query = query.eq("process_id", scope.processId);
      if (scope?.documentId) query = query.eq("document_id", scope.documentId);
      if (scope?.monitoringItemId) query = query.eq("monitoring_item_id", scope.monitoringItemId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });
}

export type TaskCommentRow = {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  comment: string;
  created_at: string;
};

export function useTaskComments(taskId: string | null) {
  return useQuery({
    enabled: Boolean(taskId),
    queryKey: ["task-comments", taskId],
    queryFn: async (): Promise<TaskCommentRow[]> => {
      const { data, error } = await db()
        .from("task_comments")
        .select("id, task_id, user_id, user_name, comment, created_at")
        .eq("task_id", taskId)
        .is("archived_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskCommentRow[];
    },
  });
}

export type TaskHistoryRow = {
  id: string;
  user_name: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export function useTaskHistory(taskId: string | null) {
  return useQuery({
    enabled: Boolean(taskId),
    queryKey: ["task-history", taskId],
    queryFn: async (): Promise<TaskHistoryRow[]> => {
      const { data, error } = await db()
        .from("task_history")
        .select("id, user_name, action, old_value, new_value, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as TaskHistoryRow[];
    },
  });
}

export type TaskFormValues = {
  title: string;
  description?: string | null;
  notes?: string | null;
  priority: PriorityLevel;
  status?: TaskStatus;
  start_date?: string | null;
  due_at?: string | null;
  due_time?: string | null;
  reminder_at?: string | null;
  recurrence_type?: RecurrenceType;
  recurrence_end_date?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  document_id?: string | null;
  monitoring_item_id?: string | null;
};

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return (organizationId: string | null, taskId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ["task-list", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["activity", organizationId] });
    if (taskId) {
      queryClient.invalidateQueries({ queryKey: ["task-history", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    }
  };
}

async function notifyAssignee(params: {
  organizationId: string;
  userId: string | null;
  actorId: string | null;
  title: string;
  body: string;
  dedupeKey: string;
}) {
  if (!params.userId || params.userId === params.actorId) return;
  await db()
    .from("notifications")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      title: params.title,
      body: params.body,
      kind: "task",
      dedupe_key: params.dedupeKey,
    });
}

/** Cria uma tarefa com vínculos e responsável. */
export function useSaveTask(organizationId: string | null) {
  const actor = useActor();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TaskFormValues }) => {
      const payload = {
        title: values.title,
        description: values.description ?? null,
        notes: values.notes ?? null,
        priority: values.priority,
        start_date: values.start_date || null,
        due_at: values.due_at || null,
        due_time: values.due_time || null,
        reminder_at: values.reminder_at || null,
        recurrence_type: values.recurrence_type ?? "none",
        recurrence_end_date: values.recurrence_end_date || null,
        assignee_id: values.assignee_id || null,
        assignee_name: values.assignee_name || null,
        client_id: values.client_id || null,
        process_id: values.process_id || null,
        document_id: values.document_id || null,
        monitoring_item_id: values.monitoring_item_id || null,
      };

      if (id) {
        const { error } = await db()
          .from("tasks")
          .update({ ...payload, updated_by: actor.userId })
          .eq("id", id)
          .eq("organization_id", organizationId);
        if (error) throw error;
        await recordAudit({
          organizationId: organizationId!,
          actorId: actor.userId,
          actorName: actor.name,
          action: "task.updated",
          entity: "task",
          entityId: id,
          metadata: { title: values.title },
        });
        await notifyAssignee({
          organizationId: organizationId!,
          userId: payload.assignee_id,
          actorId: actor.userId,
          title: "Tarefa atualizada",
          body: values.title,
          dedupeKey: `task-updated-${id}-${payload.assignee_id}`,
        });
        return { id };
      }

      const { data, error } = await db()
        .from("tasks")
        .insert({
          ...payload,
          status: values.status ?? "pendente",
          organization_id: organizationId,
          created_by: actor.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      const created = data as { id: string };

      if (payload.process_id) {
        await db().from("process_movements").insert({
          organization_id: organizationId,
          process_id: payload.process_id,
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
        entityId: created.id,
        metadata: { title: values.title },
      });
      await notifyAssignee({
        organizationId: organizationId!,
        userId: payload.assignee_id,
        actorId: actor.userId,
        title: "Nova tarefa atribuída",
        body: values.title,
        dedupeKey: `task-assigned-${created.id}-${payload.assignee_id}`,
      });
      return created;
    },
    onSuccess: (result) => invalidate(organizationId, result?.id),
  });
}

function nextOccurrence(task: TaskRow): string | null {
  if (task.recurrence_type === "none" || !task.due_at) return null;
  const base = new Date(task.due_at);
  const next = new Date(base);
  if (task.recurrence_type === "daily") next.setDate(base.getDate() + 1);
  if (task.recurrence_type === "weekly") next.setDate(base.getDate() + 7);
  if (task.recurrence_type === "monthly") next.setMonth(base.getMonth() + 1);
  if (task.recurrence_end_date && next > new Date(`${task.recurrence_end_date}T23:59:59`)) return null;
  return next.toISOString();
}

/** Altera o status (usado pelo quadro, checkbox e detalhes). Gera recorrência ao concluir. */
export function useChangeTaskStatus(organizationId: string | null) {
  const actor = useActor();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ task, status }: { task: TaskRow; status: TaskStatus }) => {
      const done = status === "concluida";
      const { error } = await db()
        .from("tasks")
        .update({
          status,
          completed_at: done ? new Date().toISOString() : null,
          completed_by: done ? actor.userId : null,
          updated_by: actor.userId,
        })
        .eq("id", task.id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      if (done) {
        const due = nextOccurrence(task);
        if (due) {
          await db().from("tasks").insert({
            organization_id: task.organization_id,
            title: task.title,
            description: task.description,
            notes: task.notes,
            priority: task.priority,
            status: "pendente",
            due_at: due,
            due_time: task.due_time,
            recurrence_type: task.recurrence_type,
            recurrence_end_date: task.recurrence_end_date,
            assignee_id: task.assignee_id,
            assignee_name: task.assignee_name,
            client_id: task.client_id,
            process_id: task.process_id,
            document_id: task.document_id,
            monitoring_item_id: task.monitoring_item_id,
            created_by: actor.userId,
          });
        }
        if (task.process_id) {
          await db().from("process_movements").insert({
            organization_id: task.organization_id,
            process_id: task.process_id,
            description: `Tarefa concluída: ${task.title}.`,
            actor_name: actor.name,
            created_by: actor.userId,
          });
        }
      }

      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: done ? "task.completed" : "task.reopened",
        entity: "task",
        entityId: task.id,
        metadata: { status },
      });
      return { id: task.id };
    },
    onSuccess: (result) => invalidate(organizationId, result?.id),
  });
}

/** Troca o responsável pela tarefa e avisa quem recebeu. */
export function useAssignTask(organizationId: string | null) {
  const actor = useActor();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({
      task,
      assigneeId,
      assigneeName,
    }: {
      task: TaskRow;
      assigneeId: string | null;
      assigneeName: string | null;
    }) => {
      const { error } = await db()
        .from("tasks")
        .update({ assignee_id: assigneeId, assignee_name: assigneeName, updated_by: actor.userId })
        .eq("id", task.id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "task.assignee_changed",
        entity: "task",
        entityId: task.id,
        metadata: { assignee: assigneeName },
      });
      await notifyAssignee({
        organizationId: organizationId!,
        userId: assigneeId,
        actorId: actor.userId,
        title: "Tarefa atribuída a você",
        body: task.title,
        dedupeKey: `task-assigned-${task.id}-${assigneeId}`,
      });
      return { id: task.id };
    },
    onSuccess: (result) => invalidate(organizationId, result?.id),
  });
}

/** Arquiva (ou restaura) a tarefa mantendo o histórico. */
export function useArchiveTask(organizationId: string | null) {
  const actor = useActor();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ task, archived }: { task: TaskRow; archived: boolean }) => {
      const { error } = await db()
        .from("tasks")
        .update({
          archived_at: archived ? new Date().toISOString() : null,
          status: archived ? "arquivada" : "pendente",
          updated_by: actor.userId,
        })
        .eq("id", task.id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: archived ? "task.archived" : "task.restored",
        entity: "task",
        entityId: task.id,
        metadata: { title: task.title },
      });
      return { id: task.id };
    },
    onSuccess: (result) => invalidate(organizationId, result?.id),
  });
}

export function useAddTaskComment(organizationId: string | null) {
  const actor = useActor();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ taskId, comment }: { taskId: string; comment: string }) => {
      const { error } = await db().from("task_comments").insert({
        organization_id: organizationId,
        task_id: taskId,
        user_id: actor.userId,
        user_name: actor.name,
        comment,
      });
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "task.comment_added",
        entity: "task",
        entityId: taskId,
      });
      return { id: taskId };
    },
    onSuccess: (result) => invalidate(organizationId, result?.id),
  });
}
