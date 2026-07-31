import { supabase } from "@/integrations/supabase/client";
import { logTechnical } from "@/lib/errors";

export type AuditAction =
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "process.created"
  | "process.stage_changed"
  | "process.owner_changed"
  | "process.due_changed"
  | "process.priority_changed"
  | "task.created"
  | "task.completed"
  | "task.reopened"
  | "task.deleted"
  | "member.role_changed"
  | "organization.sample_data";

type AuditInput = {
  organizationId: string;
  actorId?: string | null;
  actorName?: string | null;
  action: AuditAction;
  entity: "client" | "process" | "task" | "member" | "organization";
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Registro de auditoria — nunca interrompe a operação principal. */
export async function recordAudit(input: AuditInput) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      metadata: (input.metadata ?? {}) as never,
    });
    if (error) throw error;
  } catch (error) {
    logTechnical("audit", error);
  }
}
