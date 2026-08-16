import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { useActor } from "@/hooks/use-mutations";
import {
  DOCUMENTS_BUCKET,
  buildStoragePath,
  fileExtension,
  uploadWithFreshStoragePath,
  validateFile,
  type DocumentCategory,
  type DocumentStatus,
  type MonitoringSituation,
  type MonitoringStatus,
} from "@/lib/documents";

const db = () => supabase as unknown as { from: (table: string) => any; rpc: (fn: string, args?: any) => any };
const storage = () => supabase.storage.from(DOCUMENTS_BUCKET);

/* ------------------------------------------------------------------ *
 * Tipos de documento
 * ------------------------------------------------------------------ */

export type DocumentTypeRow = {
  id: string;
  name: string;
  description: string | null;
  category: DocumentCategory;
  default_validity_days: number | null;
  requires_expiration_date: boolean;
  active: boolean;
};

export function useDocumentTypes(organizationId: string | null, includeInactive = false) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["document-types", organizationId, includeInactive],
    queryFn: async (): Promise<DocumentTypeRow[]> => {
      let query = db()
        .from("document_types")
        .select("id, name, description, category, default_validity_days, requires_expiration_date, active")
        .eq("organization_id", organizationId)
        .order("name");
      if (!includeInactive) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DocumentTypeRow[];
    },
  });
}

export type DocumentTypeInput = {
  name: string;
  description?: string | null;
  category: DocumentCategory;
  default_validity_days?: number | null;
  requires_expiration_date?: boolean;
  active?: boolean;
};

export function useSaveDocumentType(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: DocumentTypeInput }) => {
      const payload = { ...values, organization_id: organizationId };
      const query = id
        ? db().from("document_types").update(payload).eq("id", id).eq("organization_id", organizationId)
        : db().from("document_types").insert({ ...payload, created_by: actor.userId });
      const { error } = await query;
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: id ? "document_type.updated" : "document_type.created",
        entity: "document_type",
        entityId: id ?? null,
        metadata: { name: values.name },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document-types", organizationId] }),
  });
}

export function useArchiveDocumentType(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await db()
        .from("document_types")
        .update({ active, archived_at: active ? null : new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "document_type.archived",
        entity: "document_type",
        entityId: id,
        metadata: { active },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document-types", organizationId] }),
  });
}

/* ------------------------------------------------------------------ *
 * Documentos
 * ------------------------------------------------------------------ */

export type DocumentRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  process_id: string | null;
  checklist_item_id: string | null;
  document_type_id: string | null;
  title: string;
  description: string | null;
  document_number: string | null;
  issuer: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  status: DocumentStatus;
  file_path: string;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  current_version: number;
  uploaded_by_name: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  clients: { id: string; name: string } | null;
  processes: { id: string; code: string; title: string | null } | null;
  document_types: { id: string; name: string; category: DocumentCategory } | null;
};

const DOCUMENT_SELECT =
  "id, organization_id, client_id, process_id, checklist_item_id, document_type_id, title, description, document_number, issuer, issue_date, expiration_date, status, file_path, original_file_name, mime_type, file_size, current_version, uploaded_by_name, reviewed_by_name, reviewed_at, rejection_reason, notes, created_at, updated_at, archived_at, clients(id, name), processes(id, code, title), document_types(id, name, category)";

export type DocumentFilters = {
  search?: string;
  clientId?: string | null;
  processId?: string | null;
  typeId?: string | null;
  status?: DocumentStatus | null;
  expiring?: "vencidos" | "30" | "60" | null;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export function useDocumentsPage(organizationId: string | null, filters: DocumentFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["documents", organizationId, filters],
    queryFn: async (): Promise<{ rows: DocumentRow[]; count: number }> => {
      let query = db()
        .from("documents")
        .select(DOCUMENT_SELECT, { count: "exact" })
        .eq("organization_id", organizationId);

      if (!filters.includeArchived) query = query.is("archived_at", null);
      if (filters.clientId) query = query.eq("client_id", filters.clientId);
      if (filters.processId) query = query.eq("process_id", filters.processId);
      if (filters.typeId) query = query.eq("document_type_id", filters.typeId);
      if (filters.status) query = query.eq("status", filters.status);

      const today = new Date().toISOString().slice(0, 10);
      if (filters.expiring === "vencidos") query = query.lt("expiration_date", today);
      if (filters.expiring === "30" || filters.expiring === "60") {
        const limit = new Date();
        limit.setDate(limit.getDate() + Number(filters.expiring));
        query = query.gte("expiration_date", today).lte("expiration_date", limit.toISOString().slice(0, 10));
      }

      const term = (filters.search ?? "").trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, " ");
        query = query.or(
          `title.ilike.%${safe}%,original_file_name.ilike.%${safe}%,document_number.ilike.%${safe}%,issuer.ilike.%${safe}%`,
        );
      }

      const from = (page - 1) * pageSize;
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as DocumentRow[], count: count ?? 0 };
    },
  });
}

export function useDocumentsFor(
  organizationId: string | null,
  scope: { clientId?: string | null; processId?: string | null },
) {
  return useQuery({
    enabled: Boolean(organizationId) && Boolean(scope.clientId || scope.processId),
    queryKey: ["documents-scope", organizationId, scope.clientId ?? null, scope.processId ?? null],
    queryFn: async (): Promise<DocumentRow[]> => {
      let query = db()
        .from("documents")
        .select(DOCUMENT_SELECT)
        .eq("organization_id", organizationId)
        .is("archived_at", null);
      if (scope.processId) query = query.eq("process_id", scope.processId);
      else if (scope.clientId) query = query.eq("client_id", scope.clientId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentRow[];
    },
  });
}

export type DocumentVersionRow = {
  id: string;
  version_number: number;
  original_file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_name: string | null;
  notes: string | null;
  created_at: string;
};

export function useDocumentVersions(documentId: string | null) {
  return useQuery({
    enabled: Boolean(documentId),
    queryKey: ["document-versions", documentId],
    queryFn: async (): Promise<DocumentVersionRow[]> => {
      const { data, error } = await db()
        .from("document_versions")
        .select(
          "id, version_number, original_file_name, file_path, file_size, mime_type, uploaded_by_name, notes, created_at",
        )
        .eq("document_id", documentId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentVersionRow[];
    },
  });
}

function invalidateDocuments(queryClient: ReturnType<typeof useQueryClient>, organizationId: string | null) {
  queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["documents-scope", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["monitoring", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["documents-summary", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["activity", organizationId] });
}

export type DocumentUploadInput = {
  file: File;
  title: string;
  description?: string | null;
  document_type_id?: string | null;
  document_number?: string | null;
  issuer?: string | null;
  issue_date?: string | null;
  expiration_date?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  checklist_item_id?: string | null;
  notes?: string | null;
  status?: DocumentStatus;
};

/** Upload real: valida, envia ao bucket privado e registra documento + versão 1. */
export function useUploadDocument(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async (input: DocumentUploadInput) => {
      if (!organizationId) throw new Error("Selecione uma empresa antes de enviar documentos.");
      const invalid = validateFile(input.file);
      if (invalid) throw new Error(invalid);

      const extension = fileExtension(input.file.name);
      const { path, storedFileName } = await uploadWithFreshStoragePath(
        () =>
          buildStoragePath({
            organizationId,
            clientId: input.client_id,
            processId: input.process_id,
            extension,
          }),
        async (candidatePath) => {
          const { error } = await storage().upload(candidatePath, input.file, {
            contentType: input.file.type || "application/octet-stream",
            upsert: false,
          });
          return { error };
        },
      );

      try {
        const { data, error } = await db()
          .from("documents")
          .insert({
            organization_id: organizationId,
            client_id: input.client_id ?? null,
            process_id: input.process_id ?? null,
            checklist_item_id: input.checklist_item_id ?? null,
            document_type_id: input.document_type_id ?? null,
            title: input.title,
            description: input.description ?? null,
            document_number: input.document_number ?? null,
            issuer: input.issuer ?? null,
            issue_date: input.issue_date || null,
            expiration_date: input.expiration_date || null,
            status: input.status ?? "recebido",
            notes: input.notes ?? null,
            file_path: path,
            original_file_name: input.file.name,
            stored_file_name: storedFileName,
            file_extension: extension,
            mime_type: input.file.type || "application/octet-stream",
            file_size: input.file.size,
            current_version: 1,
            uploaded_by: actor.userId,
            uploaded_by_name: actor.name,
          })
          .select("id, title, process_id, client_id")
          .single();
        if (error) throw error;

        await db().from("document_versions").insert({
          organization_id: organizationId,
          document_id: data.id,
          version_number: 1,
          file_path: path,
          original_file_name: input.file.name,
          stored_file_name: storedFileName,
          mime_type: input.file.type || "application/octet-stream",
          file_size: input.file.size,
          uploaded_by: actor.userId,
          uploaded_by_name: actor.name,
          notes: "Versão inicial.",
        });

        if (input.checklist_item_id) {
          await db()
            .from("process_checklist_items")
            .update({ status: "recebido", updated_by: actor.userId })
            .eq("id", input.checklist_item_id)
            .eq("organization_id", organizationId);
        }

        if (input.process_id) {
          await db().from("process_movements").insert({
            organization_id: organizationId,
            process_id: input.process_id,
            description: `Documento anexado: ${input.title}.`,
            actor_name: actor.name,
            created_by: actor.userId,
          });
        }

        await recordAudit({
          organizationId,
          actorId: actor.userId,
          actorName: actor.name,
          action: "document.uploaded",
          entity: "document",
          entityId: data.id,
          metadata: { title: input.title, file: input.file.name, size: input.file.size },
        });

        return data as { id: string };
      } catch (error) {
        await storage().remove([path]);
        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      invalidateDocuments(queryClient, organizationId);
      if (variables.process_id) {
        queryClient.invalidateQueries({ queryKey: ["process-checklist", variables.process_id] });
        queryClient.invalidateQueries({ queryKey: ["process-movements", variables.process_id] });
      }
    },
  });
}

/** Nova versão: mantém o histórico e nunca sobrescreve o arquivo anterior. */
export function useUploadDocumentVersion(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({
      document,
      file,
      notes,
    }: {
      document: DocumentRow;
      file: File;
      notes?: string | null;
    }) => {
      const invalid = validateFile(file);
      if (invalid) throw new Error(invalid);

      const extension = fileExtension(file.name);
      const { path, storedFileName } = await uploadWithFreshStoragePath(
        () =>
          buildStoragePath({
            organizationId: organizationId!,
            clientId: document.client_id,
            processId: document.process_id,
            extension,
          }),
        async (candidatePath) => {
          const { error } = await storage().upload(candidatePath, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
          return { error };
        },
      );

      const nextVersion = (document.current_version ?? 1) + 1;
      try {
        const { error } = await db()
          .from("documents")
          .update({
            file_path: path,
            original_file_name: file.name,
            stored_file_name: storedFileName,
            file_extension: extension,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size,
            current_version: nextVersion,
            status: "em_analise",
            rejection_reason: null,
            uploaded_by: actor.userId,
            uploaded_by_name: actor.name,
          })
          .eq("id", document.id)
          .eq("organization_id", organizationId);
        if (error) throw error;

        await db().from("document_versions").insert({
          organization_id: organizationId,
          document_id: document.id,
          version_number: nextVersion,
          file_path: path,
          original_file_name: file.name,
          stored_file_name: storedFileName,
          mime_type: file.type || "application/octet-stream",
          file_size: file.size,
          uploaded_by: actor.userId,
          uploaded_by_name: actor.name,
          notes: notes ?? null,
        });

        await recordAudit({
          organizationId: organizationId!,
          actorId: actor.userId,
          actorName: actor.name,
          action: "document.version_added",
          entity: "document",
          entityId: document.id,
          metadata: { version: nextVersion, file: file.name },
        });
      } catch (error) {
        await storage().remove([path]);
        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      invalidateDocuments(queryClient, organizationId);
      queryClient.invalidateQueries({ queryKey: ["document-versions", variables.document.id] });
    },
  });
}

export type DocumentUpdateInput = Partial<{
  title: string;
  description: string | null;
  document_type_id: string | null;
  document_number: string | null;
  issuer: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  client_id: string | null;
  process_id: string | null;
}>;

export function useUpdateDocument(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: DocumentUpdateInput }) => {
      const { error } = await db()
        .from("documents")
        .update(values)
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "document.updated",
        entity: "document",
        entityId: id,
        metadata: values as Record<string, unknown>,
      });
    },
    onSuccess: () => invalidateDocuments(queryClient, organizationId),
  });
}

/** Aprovação, rejeição ou reanálise — sempre com autor e data registrados. */
export function useReviewDocument(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({
      document,
      status,
      reason,
    }: {
      document: DocumentRow;
      status: DocumentStatus;
      reason?: string | null;
    }) => {
      const { error } = await db()
        .from("documents")
        .update({
          status,
          reviewed_by: actor.userId,
          reviewed_by_name: actor.name,
          reviewed_at: new Date().toISOString(),
          rejection_reason: status === "rejeitado" ? (reason ?? null) : null,
        })
        .eq("id", document.id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      if (document.checklist_item_id) {
        await db()
          .from("process_checklist_items")
          .update({
            status: status === "aprovado" ? "aprovado" : status === "rejeitado" ? "rejeitado" : "em_analise",
            updated_by: actor.userId,
          })
          .eq("id", document.checklist_item_id)
          .eq("organization_id", organizationId);
      }

      if (document.process_id) {
        await db().from("process_movements").insert({
          organization_id: organizationId,
          process_id: document.process_id,
          description:
            status === "aprovado"
              ? `Documento aprovado: ${document.title}.`
              : status === "rejeitado"
                ? `Documento rejeitado: ${document.title}. Motivo: ${reason ?? "não informado"}.`
                : `Documento em análise: ${document.title}.`,
          actor_name: actor.name,
          created_by: actor.userId,
        });
      }

      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: status === "aprovado" ? "document.approved" : status === "rejeitado" ? "document.rejected" : "document.updated",
        entity: "document",
        entityId: document.id,
        metadata: { status, reason: reason ?? null },
      });
    },
    onSuccess: (_data, variables) => {
      invalidateDocuments(queryClient, organizationId);
      if (variables.document.process_id) {
        queryClient.invalidateQueries({ queryKey: ["process-checklist", variables.document.process_id] });
        queryClient.invalidateQueries({ queryKey: ["process-movements", variables.document.process_id] });
      }
    },
  });
}

/** Arquivamento lógico — o arquivo permanece no bucket para auditoria. */
export function useArchiveDocument(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, archived, title }: { id: string; archived: boolean; title?: string }) => {
      const { error } = await db()
        .from("documents")
        .update({
          archived_at: archived ? new Date().toISOString() : null,
          status: archived ? "arquivado" : "recebido",
        })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "document.archived",
        entity: "document",
        entityId: id,
        metadata: { archived, title },
      });
    },
    onSuccess: () => invalidateDocuments(queryClient, organizationId),
  });
}

/** URL assinada de curta duração — nunca expõe o arquivo publicamente. */
export async function createDocumentUrl(path: string, download?: string) {
  const { data, error } = await storage().createSignedUrl(path, 60, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export function useDocumentsSummary(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["documents-summary", organizationId],
    queryFn: async () => {
      const { data, error } = await db()
        .from("documents")
        .select("status, expiration_date")
        .eq("organization_id", organizationId)
        .is("archived_at", null);
      if (error) throw error;
      const rows = (data ?? []) as { status: DocumentStatus; expiration_date: string | null }[];
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      const limit = in30.toISOString().slice(0, 10);
      return {
        total: rows.length,
        pending: rows.filter((row) => row.status === "pendente" || row.status === "em_analise" || row.status === "recebido").length,
        approved: rows.filter((row) => row.status === "aprovado").length,
        rejected: rows.filter((row) => row.status === "rejeitado").length,
        expired: rows.filter((row) => row.expiration_date && row.expiration_date < today).length,
        expiring: rows.filter(
          (row) => row.expiration_date && row.expiration_date >= today && row.expiration_date <= limit,
        ).length,
      };
    },
  });
}

/* ------------------------------------------------------------------ *
 * Monitoramento
 * ------------------------------------------------------------------ */

export type MonitoringRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  process_id: string | null;
  document_id: string | null;
  title: string;
  type: DocumentCategory;
  reference_number: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  responsible_name: string | null;
  status: MonitoringStatus;
  auto_generated: boolean;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  days_remaining: number | null;
  situation: MonitoringSituation;
  urgency: number;
  is_expired: boolean;
  is_expiring_soon: boolean;
  clients: { id: string; name: string } | null;
  processes: { id: string; code: string } | null;
};

const MONITORING_SELECT =
  "id, organization_id, client_id, process_id, document_id, title, type, reference_number, issue_date, expiration_date, responsible_name, status, auto_generated, notes, archived_at, created_at, days_remaining, situation, urgency, is_expired, is_expiring_soon, clients(id, name), processes(id, code)";

export type MonitoringFilters = {
  search?: string;
  clientId?: string | null;
  type?: DocumentCategory | null;
  window?: "vencidos" | "7" | "15" | "30" | "60" | null;
  status?: MonitoringStatus | null;
  includeArchived?: boolean;
};

export function useMonitoring(organizationId: string | null, filters: MonitoringFilters = {}) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["monitoring", organizationId, filters],
    queryFn: async (): Promise<MonitoringRow[]> => {
      let query = db()
        .from("monitoring_items_status_view")
        .select(MONITORING_SELECT)
        .eq("organization_id", organizationId);

      if (!filters.includeArchived) query = query.is("archived_at", null);
      if (filters.clientId) query = query.eq("client_id", filters.clientId);
      if (filters.type) query = query.eq("type", filters.type);
      if (filters.status) query = query.eq("status", filters.status);

      const today = new Date().toISOString().slice(0, 10);
      if (filters.window === "vencidos") query = query.lt("expiration_date", today);
      else if (filters.window) {
        const limit = new Date();
        limit.setDate(limit.getDate() + Number(filters.window));
        query = query.gte("expiration_date", today).lte("expiration_date", limit.toISOString().slice(0, 10));
      }

      const term = (filters.search ?? "").trim();
      if (term) {
        const safe = term.replace(/[%,()]/g, " ");
        query = query.or(`title.ilike.%${safe}%,reference_number.ilike.%${safe}%`);
      }

      const { data, error } = await query
        .order("urgency", { ascending: false })
        .order("expiration_date", { ascending: true, nullsFirst: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as MonitoringRow[];
    },
  });
}

export type MonitoringHistoryRow = {
  id: string;
  previous_expiration_date: string | null;
  new_expiration_date: string | null;
  previous_issue_date: string | null;
  new_issue_date: string | null;
  changed_by_name: string | null;
  notes: string | null;
  created_at: string;
};

export function useMonitoringHistory(itemId: string | null) {
  return useQuery({
    enabled: Boolean(itemId),
    queryKey: ["monitoring-history", itemId],
    queryFn: async (): Promise<MonitoringHistoryRow[]> => {
      const { data, error } = await db()
        .from("monitoring_history")
        .select(
          "id, previous_expiration_date, new_expiration_date, previous_issue_date, new_issue_date, changed_by_name, notes, created_at",
        )
        .eq("monitoring_item_id", itemId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonitoringHistoryRow[];
    },
  });
}

export type MonitoringInput = {
  title: string;
  type: DocumentCategory;
  reference_number?: string | null;
  issue_date?: string | null;
  expiration_date?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  responsible_name?: string | null;
  status?: MonitoringStatus;
  notes?: string | null;
};

export function useSaveMonitoringItem(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: MonitoringInput }) => {
      const payload = {
        ...values,
        issue_date: values.issue_date || null,
        expiration_date: values.expiration_date || null,
        organization_id: organizationId,
      };
      const query = id
        ? db().from("monitoring_items").update(payload).eq("id", id).eq("organization_id", organizationId)
        : db()
            .from("monitoring_items")
            .insert({ ...payload, created_by: actor.userId, responsible_user_id: actor.userId });
      const { error } = await query;
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: id ? "monitoring.updated" : "monitoring.created",
        entity: "monitoring",
        entityId: id ?? null,
        metadata: { title: values.title },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monitoring", organizationId] }),
  });
}

/** Renovação: guarda datas anteriores no histórico e atualiza a vigência. */
export function useRenewMonitoringItem(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({
      item,
      issueDate,
      expirationDate,
      notes,
    }: {
      item: MonitoringRow;
      issueDate?: string | null;
      expirationDate: string;
      notes?: string | null;
    }) => {
      const { error } = await db()
        .from("monitoring_items")
        .update({
          issue_date: issueDate || item.issue_date,
          expiration_date: expirationDate,
          status: "renovado",
        })
        .eq("id", item.id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      const { error: historyError } = await db().from("monitoring_history").insert({
        organization_id: organizationId,
        monitoring_item_id: item.id,
        previous_issue_date: item.issue_date,
        new_issue_date: issueDate || item.issue_date,
        previous_expiration_date: item.expiration_date,
        new_expiration_date: expirationDate,
        previous_document_id: item.document_id,
        changed_by: actor.userId,
        changed_by_name: actor.name,
        notes: notes ?? null,
      });
      if (historyError) throw historyError;

      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "monitoring.renewed",
        entity: "monitoring",
        entityId: item.id,
        metadata: { from: item.expiration_date, to: expirationDate },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["monitoring", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["monitoring-history", variables.item.id] });
    },
  });
}

export function useArchiveMonitoringItem(organizationId: string | null) {
  const queryClient = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await db()
        .from("monitoring_items")
        .update({
          archived_at: archived ? new Date().toISOString() : null,
          status: archived ? "arquivado" : "ativo",
        })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      await recordAudit({
        organizationId: organizationId!,
        actorId: actor.userId,
        actorName: actor.name,
        action: "monitoring.archived",
        entity: "monitoring",
        entityId: id,
        metadata: { archived },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monitoring", organizationId] }),
  });
}
