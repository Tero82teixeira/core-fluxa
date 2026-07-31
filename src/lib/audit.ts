import { supabase } from "@/integrations/supabase/client";
import { logTechnical } from "@/lib/errors";

export type AuditAction =
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "client.restored"
  | "process.created"
  | "process.updated"
  | "process.stage_changed"
  | "process.owner_changed"
  | "process.due_changed"
  | "process.priority_changed"
  | "checklist.created"
  | "checklist.updated"
  | "checklist.removed"
  | "service_type.created"
  | "service_type.updated"
  | "service_type.archived"
  | "task.created"
  | "task.updated"
  | "task.completed"
  | "task.reopened"
  | "task.deleted"
  | "member.role_changed"
  | "organization.sample_data"
  | "document.uploaded"
  | "document.version_added"
  | "document.updated"
  | "document.approved"
  | "document.rejected"
  | "document.archived"
  | "document.downloaded"
  | "document_type.created"
  | "document_type.updated"
  | "document_type.archived"
  | "monitoring.created"
  | "monitoring.updated"
  | "monitoring.renewed"
  | "monitoring.archived"
  | "task.archived"
  | "task.restored"
  | "task.assignee_changed"
  | "task.comment_added"
  | "invite.created"
  | "invite.resent"
  | "invite.cancelled"
  | "invite.accepted"
  | "member.deactivated"
  | "member.reactivated"
  | "member.responsibilities_transferred";

type AuditInput = {
  organizationId: string;
  actorId?: string | null;
  actorName?: string | null;
  action: AuditAction;
  entity:
    | "client"
    | "process"
    | "task"
    | "member"
    | "organization"
    | "checklist"
    | "service_type"
    | "document"
    | "document_type"
    | "monitoring";
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
