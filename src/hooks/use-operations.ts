import { useMemo } from "react";
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
  birth_date: string | null;
  legal_rep_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  zip_code: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  status: ClientStatus;
  owner_name: string | null;
  notes: string | null;
  last_interaction_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type ProcessRow = {
  id: string;
  organization_id: string;
  code: string;
  client_id: string;
  service_type_id: string | null;
  title: string | null;
  description: string | null;
  notes: string | null;
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
  created_at: string;
  updated_at: string;
  clients?: { id: string; name: string; document: string | null; status: ClientStatus } | null;
  service_types?: { id: string; name: string } | null;
};

export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: PriorityLevel;
  due_at: string | null;
  assignee_name: string | null;
  completed_at: string | null;
  client_id: string | null;
  process_id: string | null;
  deleted_at: string | null;
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

export type ChecklistRow = {
  id: string;
  organization_id: string;
  process_id: string;
  title: string;
  description: string | null;
  status: "pendente" | "recebido" | "em_analise" | "aprovado" | "rejeitado";
  required: boolean;
  position: number;
  assignee_name: string | null;
  due_date: string | null;
  deleted_at: string | null;
};

const db = () => supabase as unknown as { from: (table: string) => any };

export const CLIENT_COLUMNS =
  "id, organization_id, person_type, name, trade_name, document, document_digits, birth_date, legal_rep_name, email, phone, whatsapp, zip_code, street, number, complement, district, city, state, status, owner_name, notes, last_interaction_at, archived_at, created_at, updated_at";

const PROCESS_COLUMNS = "*, clients(id, name, status), service_types(id, name)";

/** Visão segura: mascara dados sensíveis do cliente conforme o papel do usuário. */
const CLIENTS_SOURCE = "clients_secure";

/* ------------------------------------------------------------------ *
 * Clientes
 * ------------------------------------------------------------------ */

/** Lista enxuta para seletores (nunca traz outra organização). */
export function useClients(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["clients", organizationId],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await db()
        .from(CLIENTS_SOURCE)
        .select(CLIENT_COLUMNS)
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("name")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });
}

export type ClientFilters = {
  term: string;
  status: string;
  personType: string;
  owner: string;
  sort: "name" | "recent" | "created";
  archived: boolean;
  page: number;
  pageSize: number;
};

export function useClientsPage(organizationId: string | null, filters: ClientFilters) {
  const { term, status, personType, owner, sort, archived, page, pageSize } = filters;
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["clients-page", organizationId, term, status, personType, owner, sort, archived, page, pageSize],
    queryFn: async (): Promise<{ rows: ClientRow[]; count: number }> => {
      let q = db()
        .from(CLIENTS_SOURCE)
        .select(CLIENT_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId);

      q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
      if (status !== "todos") q = q.eq("status", status);
      if (personType !== "todos") q = q.eq("person_type", personType);
      if (owner !== "todos") q = q.eq("owner_name", owner);

      const needle = term.trim();
      if (needle.length >= 2) {
        const like = `%${needle}%`;
        const numeric = digits(needle);
        const parts = [`name.ilike.${like}`, `trade_name.ilike.${like}`, `email.ilike.${like}`];
        if (numeric.length >= 3) {
          parts.push(`document_digits.ilike.%${numeric}%`, `phone.ilike.%${numeric}%`, `whatsapp.ilike.%${numeric}%`);
        }
        q = q.or(parts.join(","));
      }

      if (sort === "name") q = q.order("name");
      else if (sort === "recent") q = q.order("last_interaction_at", { ascending: false, nullsFirst: false });
      else q = q.order("created_at", { ascending: false });

      const from = page * pageSize;
      const { data, error, count } = await q.range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as ClientRow[], count: count ?? 0 };
    },
  });
}

export function useClientOwners(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["client-owners", organizationId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db()
        .from(CLIENTS_SOURCE)
        .select("owner_name")
        .eq("organization_id", organizationId)
        .not("owner_name", "is", null)
        .limit(500);
      if (error) throw error;
      const names = (data ?? []).map((row: any) => String(row.owner_name));
      return Array.from(new Set<string>(names)).sort();
    },
  });
}

export function useClient(clientId: string) {
  return useQuery({
    enabled: Boolean(clientId),
    queryKey: ["client", clientId],
    queryFn: async (): Promise<ClientRow | null> => {
      const { data, error } = await db().from(CLIENTS_SOURCE).select(CLIENT_COLUMNS).eq("id", clientId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ClientRow | null;
    },
  });
}

/* ------------------------------------------------------------------ *
 * Processos
 * ------------------------------------------------------------------ */

export function useProcesses(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["processes", organizationId],
    queryFn: async (): Promise<ProcessRow[]> => {
      const { data, error } = await db()
        .from("processes")
        .select(PROCESS_COLUMNS)
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ProcessRow[];
    },
  });
}

export type ProcessFilters = {
  term: string;
  clientId: string;
  serviceTypeId: string;
  stage: string;
  priority: string;
  owner: string;
  financial: string;
  deadline: "todos" | "atrasados" | "hoje" | "semana" | "sem_prazo";
  archived: boolean;
  sort: "due" | "recent" | "code";
  page: number;
  pageSize: number;
};

export function useProcessesPage(organizationId: string | null, filters: ProcessFilters) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["processes-page", organizationId, filters],
    queryFn: async (): Promise<{ rows: ProcessRow[]; count: number }> => {
      let q = db()
        .from("processes")
        .select(PROCESS_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId);

      q = filters.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
      if (filters.clientId !== "todos") q = q.eq("client_id", filters.clientId);
      if (filters.serviceTypeId !== "todos") q = q.eq("service_type_id", filters.serviceTypeId);
      if (filters.stage !== "todos") q = q.eq("stage", filters.stage);
      if (filters.priority !== "todos") q = q.eq("priority", filters.priority);
      if (filters.owner !== "todos") q = q.eq("owner_name", filters.owner);
      if (filters.financial !== "todos") q = q.eq("financial_status", filters.financial);

      const today = new Date().toISOString().slice(0, 10);
      if (filters.deadline === "atrasados") q = q.lt("due_date", today);
      if (filters.deadline === "hoje") q = q.eq("due_date", today);
      if (filters.deadline === "semana") {
        const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
        q = q.gte("due_date", today).lte("due_date", week);
      }
      if (filters.deadline === "sem_prazo") q = q.is("due_date", null);

      const needle = filters.term.trim();
      if (needle.length >= 2) {
        const like = `%${needle}%`;
        q = q.or(`code.ilike.${like},title.ilike.${like},protocol.ilike.${like}`);
      }

      if (filters.sort === "due") q = q.order("due_date", { ascending: true, nullsFirst: false });
      else if (filters.sort === "recent") q = q.order("last_movement_at", { ascending: false, nullsFirst: false });
      else q = q.order("code", { ascending: false });

      const from = filters.page * filters.pageSize;
      const { data, error, count } = await q.range(from, from + filters.pageSize - 1);
      if (error) throw error;
      return { rows: (data ?? []) as ProcessRow[], count: count ?? 0 };
    },
  });
}

export function useClientProcesses(clientId: string | null) {
  return useQuery({
    enabled: Boolean(clientId),
    queryKey: ["client-processes", clientId],
    queryFn: async (): Promise<ProcessRow[]> => {
      const { data, error } = await db()
        .from("processes")
        .select(PROCESS_COLUMNS)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProcessRow[];
    },
  });
}

export function useProcess(processId: string) {
  return useQuery({
    enabled: Boolean(processId),
    queryKey: ["process", processId],
    queryFn: async (): Promise<ProcessRow | null> => {
      const { data, error } = await db().from("processes").select(PROCESS_COLUMNS).eq("id", processId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProcessRow | null;
    },
  });
}

export function useProcessMovements(processId: string) {
  return useQuery({
    enabled: Boolean(processId),
    queryKey: ["process-movements", processId],
    queryFn: async (): Promise<MovementRow[]> => {
      const { data, error } = await db()
        .from("process_movements")
        .select("*")
        .eq("process_id", processId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as MovementRow[];
    },
  });
}

export function useProcessChecklist(processId: string) {
  return useQuery({
    enabled: Boolean(processId),
    queryKey: ["process-checklist", processId],
    queryFn: async (): Promise<ChecklistRow[]> => {
      const { data, error } = await db()
        .from("process_checklist_items")
        .select("*")
        .eq("process_id", processId)
        .is("deleted_at", null)
        .order("position");
      if (error) throw error;
      return (data ?? []) as ChecklistRow[];
    },
  });
}

/* ------------------------------------------------------------------ *
 * Tarefas / atividade
 * ------------------------------------------------------------------ */

export function useTasks(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["tasks", organizationId],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await db()
        .from("tasks")
        .select("*, clients(name)")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(500);
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

export type SearchResults = {
  clients: { id: string; name: string; document: string | null }[];
  processes: { id: string; code: string; title: string | null; protocol: string | null }[];
  tasks: { id: string; title: string; process_id: string | null; client_id: string | null }[];
};

const EMPTY_SEARCH: SearchResults = { clients: [], processes: [], tasks: [] };

export function useGlobalSearch(organizationId: string | null, term: string) {
  const trimmed = term.trim();
  const query = useQuery({
    enabled: Boolean(organizationId) && trimmed.length >= 2,
    queryKey: ["global-search", organizationId, trimmed],
    queryFn: async (): Promise<SearchResults> => {
      const like = `%${trimmed}%`;
      const numeric = digits(trimmed);
      const clientFilter = [
        `name.ilike.${like}`,
        `email.ilike.${like}`,
        numeric.length >= 3 ? `document_digits.ilike.%${numeric}%` : null,
        numeric.length >= 3 ? `phone.ilike.%${numeric}%` : null,
      ]
        .filter(Boolean)
        .join(",");

      const [clientsRes, processesRes] = await Promise.all([
        db().from("clients").select("id, name, document").eq("organization_id", organizationId).or(clientFilter).limit(6),
        db()
          .from("processes")
          .select("id, code, title, protocol")
          .eq("organization_id", organizationId)
          .or(`code.ilike.${like},title.ilike.${like},protocol.ilike.${like}`)
          .limit(6),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (processesRes.error) throw processesRes.error;
      return { clients: clientsRes.data ?? [], processes: processesRes.data ?? [], tasks: [] };
    },
  });

  const data = useMemo(() => query.data ?? EMPTY_SEARCH, [query.data]);
  return { ...query, data };
}

export function useCompleteTask(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await db()
        .from("tasks")
        .update({ status: "concluida", completed_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });
}
