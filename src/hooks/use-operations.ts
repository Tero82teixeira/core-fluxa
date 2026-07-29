import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { digits } from "@/lib/format";
import type {
  ClientStatus,
  FinancialStatus,
  PriorityLevel,
  ProcessStage,
  TaskStatus,
} from "@/lib/domain";

export type ClientRow = {
  id: string;
  organization_id: string;
  person_type: "pf" | "pj";
  name: string;
  trade_name: string | null;
  document: string | null;
  document_digits: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  status: ClientStatus;
  owner_name: string | null;
  notes: string | null;
  last_interaction_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export type ProcessRow = {
  id: string;
  organization_id: string;
  code: string;
  client_id: string;
  title: string | null;
  stage: ProcessStage;
  priority: PriorityLevel;
  owner_name: string | null;
  opened_at: string;
  due_date: string | null;
  protocol: string | null;
  last_movement_at: string | null;
  documents_total: number;
  documents_received: number;
  value: number | null;
  financial_status: FinancialStatus;
  archived_at: string | null;
  clients?: { id: string; name: string; document: string | null; status: ClientStatus } | null;
  service_types?: { id: string; name: string } | null;
};

export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  status: TaskStatus;
  priority: PriorityLevel;
  due_at: string | null;
  assignee_name: string | null;
  client_id: string | null;
  process_id: string | null;
  clients?: { name: string } | null;
};

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
};

export type MovementRow = {
  id: string;
  description: string;
  actor_name: string | null;
  created_at: string;
  from_stage: ProcessStage | null;
  to_stage: ProcessStage | null;
  process_id: string;
  processes?: { code: string; clients?: { name: string } | null } | null;
};

const db = () => supabase as unknown as {
  from: (table: string) => any;
};

export function useClients(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["clients", organizationId],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await db()
        .from("clients")
        .select("*")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });
}

export function useClient(clientId: string) {
  return useQuery({
    queryKey: ["client", clientId],
    queryFn: async (): Promise<ClientRow | null> => {
      const { data, error } = await db().from("clients").select("*").eq("id", clientId).maybeSingle();
      if (error) throw error;
      return data as ClientRow | null;
    },
  });
}

export function useProcesses(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["processes", organizationId],
    queryFn: async (): Promise<ProcessRow[]> => {
      const { data, error } = await db()
        .from("processes")
        .select("*, clients(id, name, document, status), service_types(id, name)")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ProcessRow[];
    },
  });
}

export function useProcess(processId: string) {
  return useQuery({
    queryKey: ["process", processId],
    queryFn: async (): Promise<ProcessRow | null> => {
      const { data, error } = await db()
        .from("processes")
        .select("*, clients(id, name, document, status), service_types(id, name)")
        .eq("id", processId)
        .maybeSingle();
      if (error) throw error;
      return data as ProcessRow | null;
    },
  });
}

export function useProcessMovements(processId: string) {
  return useQuery({
    queryKey: ["process-movements", processId],
    queryFn: async (): Promise<MovementRow[]> => {
      const { data, error } = await db()
        .from("process_movements")
        .select("*")
        .eq("process_id", processId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MovementRow[];
    },
  });
}

export function useTasks(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["tasks", organizationId],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await db()
        .from("tasks")
        .select("*, clients(name)")
        .eq("organization_id", organizationId)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });
}

export function useRecentActivity(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["activity", organizationId],
    queryFn: async (): Promise<MovementRow[]> => {
      const { data, error } = await db()
        .from("process_movements")
        .select("*, processes(code, clients(name))")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as MovementRow[];
    },
  });
}

export function useNotifications(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["notifications", organizationId],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await db()
        .from("notifications")
        .select("id, title, body, kind, read_at, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

export function useGlobalSearch(organizationId: string | null, term: string) {
  const trimmed = term.trim();
  return useQuery({
    enabled: Boolean(organizationId) && trimmed.length >= 2,
    queryKey: ["global-search", organizationId, trimmed],
    queryFn: async () => {
      const like = `%${trimmed}%`;
      const numeric = digits(trimmed);
      const clientFilter = [
        `name.ilike.${like}`,
        `email.ilike.${like}`,
        numeric ? `document_digits.ilike.%${numeric}%` : null,
        numeric ? `phone.ilike.%${numeric}%` : null,
      ]
        .filter(Boolean)
        .join(",");

      const [clientsRes, processesRes] = await Promise.all([
        db()
          .from("clients")
          .select("id, name, document")
          .eq("organization_id", organizationId)
          .or(clientFilter)
          .limit(6),
        db()
          .from("processes")
          .select("id, code, title, protocol")
          .eq("organization_id", organizationId)
          .or(`code.ilike.${like},title.ilike.${like},protocol.ilike.${like}`)
          .limit(6),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (processesRes.error) throw processesRes.error;
      return {
        clients: (clientsRes.data ?? []) as { id: string; name: string; document: string | null }[],
        processes: (processesRes.data ?? []) as {
          id: string;
          code: string;
          title: string | null;
          protocol: string | null;
        }[],
      };
    },
  });
}

export function useCompleteTask(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await db()
        .from("tasks")
        .update({ status: "concluida", completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });
}

export function useMoveProcessStage(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      processId: string;
      from: ProcessStage;
      to: ProcessStage;
      actorName: string;
      label: string;
    }) => {
      const now = new Date().toISOString();
      const { error } = await db()
        .from("processes")
        .update({ stage: input.to, last_movement_at: now })
        .eq("id", input.processId);
      if (error) throw error;
      const { error: movementError } = await db().from("process_movements").insert({
        organization_id: organizationId,
        process_id: input.processId,
        from_stage: input.from,
        to_stage: input.to,
        description: `Etapa alterada para ${input.label}.`,
        actor_name: input.actorName,
      });
      if (movementError) throw movementError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["processes", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["activity", organizationId] });
    },
  });
}

export function useCreateClient(organizationId: string | null, actorId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ClientRow>) => {
      const { data, error } = await db()
        .from("clients")
        .insert({
          ...payload,
          organization_id: organizationId,
          document_digits: payload.document ? digits(payload.document) : null,
          created_by: actorId ?? null,
          updated_by: actorId ?? null,
          last_interaction_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients", organizationId] }),
  });
}
