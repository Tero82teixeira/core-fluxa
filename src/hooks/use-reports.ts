import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchOperationalMonitoring } from "@/hooks/use-monitoring-center";

const db = () => supabase as unknown as { from: (table: string) => any };
const LIMIT = 1000;
async function rows(table: string, select: string, organizationId: string) {
  const { data, error } = await db().from(table).select(select).eq("organization_id", organizationId).limit(LIMIT);
  if (error) throw error;
  return data ?? [];
}

/** Fonte única dos relatórios. O RLS ainda determina quais linhas o papel atual pode ler. */
export function useReportData(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["reports", organizationId],
    staleTime: 60_000,
    queryFn: async () => {
      if (!organizationId) throw new Error("Selecione uma organização ativa para consultar relatórios.");
      const [clients, tasks, processes, documents, monitoring, members] = await Promise.all([
        rows("clients_secure", "id,name,status,city,state,owner_id,owner_name,created_at,archived_at", organizationId),
        rows("tasks", "id,title,status,priority,due_at,completed_at,created_at,assignee_id,assignee_name,client_id,process_id,archived_at,deleted_at", organizationId),
        rows("processes", "id,code,title,stage,priority,owner_id,owner_name,client_id,opened_at,last_movement_at,archived_at", organizationId),
        rows("documents", "id,title,status,expiration_date,created_at,client_id,process_id,uploaded_by_name,archived_at", organizationId),
        fetchOperationalMonitoring(organizationId),
        rows("organization_members", "id,user_id,role,is_active,created_at", organizationId),
      ]);
      return { clients, tasks, processes, documents, monitoring, members };
    },
  });
}

export const useReportOverview = useReportData;
export const useTaskReport = useReportData;
export const useProcessReport = useReportData;
export const useClientReport = useReportData;
export const useDocumentReport = useReportData;
export const useMonitoringReport = useReportData;
export const useTeamReport = useReportData;
