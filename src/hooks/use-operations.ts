import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { digits } from "@/lib/format";
import { DEMO_MODE } from "@/lib/demo";
import { useDemoState, completeDemoTask } from "@/lib/demo-store";
import type { ChecklistItem, DemoClient, DemoProcess, DemoTask } from "@/lib/demo-data";
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

/** Resultado no mesmo formato do react-query para as fontes de demonstração. */
type DemoResult<T> = { data: T; isLoading: false; isError: false };
const demoResult = <T,>(data: T): DemoResult<T> => ({ data, isLoading: false, isError: false });

export function useClients(organizationId: string | null) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE && Boolean(organizationId),
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
  if (DEMO_MODE) return demoResult<DemoClient[]>(demo.clients);
  return { ...query, data: (query.data ?? []) as DemoClient[] };
}

export function useClient(clientId: string) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE,
    queryKey: ["client", clientId],
    queryFn: async (): Promise<ClientRow | null> => {
      const { data, error } = await db().from("clients").select("*").eq("id", clientId).maybeSingle();
      if (error) throw error;
      return data as ClientRow | null;
    },
  });
  if (DEMO_MODE) return demoResult<DemoClient | null>(demo.clients.find((c) => c.id === clientId) ?? null);
  return { ...query, data: (query.data ?? null) as DemoClient | null };
}

export function useProcesses(organizationId: string | null) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE && Boolean(organizationId),
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
  if (DEMO_MODE) return demoResult<DemoProcess[]>(demo.processes);
  return { ...query, data: (query.data ?? []) as DemoProcess[] };
}

export function useProcess(processId: string) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE,
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
  if (DEMO_MODE) return demoResult<DemoProcess | null>(demo.processes.find((p) => p.id === processId) ?? null);
  return { ...query, data: (query.data ?? null) as DemoProcess | null };
}

export function useProcessMovements(processId: string) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE,
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
  if (DEMO_MODE) return demoResult(demo.movements.filter((m) => m.process_id === processId));
  return { ...query, data: query.data ?? [] };
}

/** Checklist documental — apenas demonstrativo nesta etapa. */
export function useProcessChecklist(processId: string): DemoResult<ChecklistItem[]> {
  const demo = useDemoState();
  return demoResult(demo.checklist.filter((item) => item.process_id === processId));
}

export function useTasks(organizationId: string | null) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE && Boolean(organizationId),
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
  if (DEMO_MODE) return demoResult<DemoTask[]>(demo.tasks);
  return { ...query, data: (query.data ?? []) as DemoTask[] };
}

export function useRecentActivity(organizationId: string | null) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE && Boolean(organizationId),
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
  if (DEMO_MODE) return demoResult(demo.movements);
  return { ...query, data: query.data ?? [] };
}

export function useNotifications(organizationId: string | null) {
  const demo = useDemoState();
  const query = useQuery({
    enabled: !DEMO_MODE && Boolean(organizationId),
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
  if (DEMO_MODE) return demoResult(demo.notifications);
  return { ...query, data: query.data ?? [] };
}

export type SearchResults = {
  clients: { id: string; name: string; document: string | null }[];
  processes: { id: string; code: string; title: string | null; protocol: string | null }[];
  tasks: { id: string; title: string; process_id: string | null; client_id: string | null }[];
};

export function useGlobalSearch(organizationId: string | null, term: string) {
  const trimmed = term.trim();
  const demo = useDemoState();

  const demoData = useMemo<SearchResults>(() => {
    const needle = trimmed.toLowerCase();
    const numeric = digits(trimmed);
    if (needle.length < 2) return { clients: [], processes: [], tasks: [] };
    return {
      clients: demo.clients
        .filter(
          (client) =>
            client.name.toLowerCase().includes(needle) ||
            (client.email ?? "").toLowerCase().includes(needle) ||
            (numeric.length >= 3 && (client.document_digits ?? "").includes(numeric)) ||
            (numeric.length >= 3 && (client.phone ?? "").includes(numeric)),
        )
        .slice(0, 6)
        .map((client) => ({ id: client.id, name: client.name, document: client.document })),
      processes: demo.processes
        .filter(
          (process) =>
            process.code.toLowerCase().includes(needle) ||
            (process.title ?? "").toLowerCase().includes(needle) ||
            (process.protocol ?? "").toLowerCase().includes(needle) ||
            (process.clients?.name ?? "").toLowerCase().includes(needle),
        )
        .slice(0, 6)
        .map((process) => ({
          id: process.id,
          code: process.code,
          title: process.title,
          protocol: process.protocol,
        })),
      tasks: demo.tasks
        .filter((task) => task.title.toLowerCase().includes(needle))
        .slice(0, 5)
        .map((task) => ({ id: task.id, title: task.title, process_id: task.process_id, client_id: task.client_id })),
    };
  }, [demo, trimmed]);

  const query = useQuery({
    enabled: !DEMO_MODE && Boolean(organizationId) && trimmed.length >= 2,
    queryKey: ["global-search", organizationId, trimmed],
    queryFn: async (): Promise<SearchResults> => {
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
      return {
        clients: clientsRes.data ?? [],
        processes: processesRes.data ?? [],
        tasks: [],
      };
    },
  });

  if (DEMO_MODE) return demoResult<SearchResults>(demoData);
  return { ...query, data: query.data ?? { clients: [], processes: [], tasks: [] } };
}

export function useCompleteTask(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      if (DEMO_MODE) {
        // TODO(supabase): apenas sessão de demonstração — nada é gravado.
        completeDemoTask(taskId);
        return;
      }
      const { error } = await db()
        .from("tasks")
        .update({ status: "concluida", completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] }),
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
