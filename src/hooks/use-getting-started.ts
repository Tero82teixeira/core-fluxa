import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type GettingStartedProgress = {
  clients: number;
  processes: number;
  tasks: number;
  team: number;
};

const db = () => supabase as unknown as { from: (table: string) => any };

async function countRows(table: string, organizationId: string) {
  const { count, error } = await db()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) throw error;
  return count ?? 0;
}

/** Contagens mínimas para orientar o proprietário sem carregar listas inteiras. */
export function useGettingStarted(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: Boolean(organizationId) && enabled,
    queryKey: ["getting-started", organizationId],
    queryFn: async (): Promise<GettingStartedProgress> => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const [clients, processes, tasks, team] = await Promise.all([
        countRows("clients", organizationId),
        countRows("processes", organizationId),
        countRows("tasks", organizationId),
        countRows("organization_members", organizationId),
      ]);
      return { clients, processes, tasks, team };
    },
  });
}
