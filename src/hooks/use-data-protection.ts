import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BACKUP_SECTIONS,
  backupBlob,
  backupFileName,
  downloadBlob,
  type OrganizationBackup,
} from "@/lib/data-protection";

const db = () =>
  supabase as unknown as {
    from: (table: string) => any;
    rpc: (name: string, args: unknown) => any;
  };
const PAGE_SIZE = 1_000;

export type AuditEvent = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

async function organizationRows(table: string, organizationId: string) {
  const result: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db()
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      const permissionDenied =
        error.code === "42501" ||
        /permission denied|row-level security|not allowed/i.test(error.message ?? "");
      const unavailable =
        error.code === "PGRST205" ||
        error.code === "42P01" ||
        /could not find the table|relation .* does not exist|schema cache/i.test(
          error.message ?? "",
        );
      if (permissionDenied) return { rows: result, restricted: true, unavailable: false };
      if (unavailable) return { rows: result, restricted: false, unavailable: true };
      throw new Error(`Falha ao exportar ${table}: ${error.message}`);
    }
    const page = data ?? [];
    result.push(...page);
    if (page.length < PAGE_SIZE)
      return { rows: result, restricted: false, unavailable: false };
  }
}

async function createOrganizationBackup(
  organizationId: string,
  organizationName: string,
  onProgress?: (completed: number, total: number, label: string) => void,
) {
  const { data: organization, error: organizationError } = await db()
    .from("organizations")
    .select("id,legal_name,trade_name,document,email,phone,whatsapp,website,created_at,updated_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError) throw organizationError;

  const sections: Record<string, unknown[]> = {};
  const restrictedSections: Array<{ key: string; label: string }> = [];
  const unavailableSections: Array<{ key: string; label: string }> = [];
  for (let index = 0; index < BACKUP_SECTIONS.length; index += 1) {
    const section = BACKUP_SECTIONS[index];
    onProgress?.(index, BACKUP_SECTIONS.length, section.label);
    const result = await organizationRows(section.table, organizationId);
    sections[section.key] = result.rows;
    if (result.restricted) restrictedSections.push({ key: section.key, label: section.label });
    if (result.unavailable)
      unavailableSections.push({ key: section.key, label: section.label });
  }
  const sectionCounts = Object.fromEntries(
    Object.entries(sections).map(([key, rows]) => [key, rows.length]),
  );
  const recordCount = Object.values(sectionCounts).reduce((total, count) => total + count, 0);
  const generatedAt = new Date().toISOString();
  const payload: OrganizationBackup = {
    manifest: {
      product: "FLUXA",
      version: 1,
      generated_at: generatedAt,
      organization_id: organizationId,
      organization_name: organizationName,
      record_count: recordCount,
      section_counts: sectionCounts,
      restricted_sections: restrictedSections,
      unavailable_sections: unavailableSections,
      security: "Segredos, chaves de API, tokens e credenciais não fazem parte desta exportação.",
      document_notice:
        "A exportação contém os dados e o inventário dos documentos, não as cópias binárias dos arquivos protegidos.",
    },
    organization: organization ?? null,
    data: sections,
  };
  onProgress?.(BACKUP_SECTIONS.length, BACKUP_SECTIONS.length, "Preparando arquivo");
  const file = await backupBlob(payload);
  const fileName = backupFileName(organizationName, generatedAt, file.compressed);
  downloadBlob(file.blob, fileName);

  const { error: auditError } = await db().rpc("record_audit_event", {
    _organization_id: organizationId,
    _action: "organization.backup.exported",
    _entity: "organization",
    _entity_id: organizationId,
    _metadata: {
      file_name: fileName,
      file_size_bytes: file.blob.size,
      record_count: recordCount,
      section_count: BACKUP_SECTIONS.length,
      restricted_section_count: restrictedSections.length,
      unavailable_section_count: unavailableSections.length,
      compressed: file.compressed,
    },
  });
  return {
    fileName,
    fileSize: file.blob.size,
    recordCount,
    restrictedSectionCount: restrictedSections.length,
    unavailableSectionCount: unavailableSections.length,
    auditRecorded: !auditError,
  };
}

export function useOrganizationAudit(organizationId: string | null, limit = 100) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["organization-audit", organizationId, limit],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await db()
        .from("audit_logs")
        .select("id,action,entity,entity_id,actor_id,actor_name,metadata,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditEvent[];
    },
  });
}

export function useOrganizationBackups(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["organization-backups", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await db()
        .from("audit_logs")
        .select("id,actor_name,metadata,created_at")
        .eq("organization_id", organizationId)
        .eq("action", "organization.backup.exported")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<
        Pick<AuditEvent, "id" | "actor_name" | "metadata" | "created_at">
      >;
    },
  });
}

export function useExportOrganizationBackup(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationName,
      onProgress,
    }: {
      organizationName: string;
      onProgress?: (completed: number, total: number, label: string) => void;
    }) => {
      if (!organizationId) throw new Error("Selecione uma empresa antes de gerar a exportação.");
      return createOrganizationBackup(organizationId, organizationName, onProgress);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organization-backups", organizationId] });
      void queryClient.invalidateQueries({ queryKey: ["organization-audit", organizationId] });
    },
  });
}
