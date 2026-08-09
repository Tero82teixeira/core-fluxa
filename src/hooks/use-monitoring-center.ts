import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MonitoringAlert, MonitoringPriority, MonitoringStatus } from "@/lib/monitoring";

const db = () => supabase as unknown as { from: (name: string) => any; rpc: (name: string, args: any) => any };

export function useOperationalMonitoring(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId), queryKey: ["operational-monitoring", organizationId],
    queryFn: async () => {
      const { data, error } = await db().from("operational_monitoring_alerts").select("*").eq("organization_id", organizationId).limit(1000);
      if (error) throw error;
      return (data ?? []) as MonitoringAlert[];
    },
  });
}

function useMonitoringMutation(organizationId: string | null, rpc: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: async (args: Record<string, unknown>) => {
    const { error } = await db().rpc(rpc, { _organization_id: organizationId, ...args }); if (error) throw error;
  }, onSuccess: () => client.invalidateQueries({ queryKey: ["operational-monitoring", organizationId] }) });
}

export function useMonitoringActions(organizationId: string | null) {
  const status = useMonitoringMutation(organizationId, "change_monitoring_status");
  const assign = useMonitoringMutation(organizationId, "assign_monitoring_item");
  const note = useMonitoringMutation(organizationId, "add_monitoring_note");
  const priority = useMonitoringMutation(organizationId, "upsert_monitoring_state");
  return {
    pending: status.isPending || assign.isPending || note.isPending || priority.isPending,
    changeStatus: (a: MonitoringAlert, value: MonitoringStatus) => status.mutateAsync({ _source_type: a.source_type, _source_id: a.source_id, _alert_kind: a.alert_kind, _status: value }),
    assign: (a: MonitoringAlert, userId: string | null) => assign.mutateAsync({ _source_type: a.source_type, _source_id: a.source_id, _alert_kind: a.alert_kind, _assigned_to: userId }),
    addNote: (a: MonitoringAlert, value: string) => note.mutateAsync({ _source_type: a.source_type, _source_id: a.source_id, _alert_kind: a.alert_kind, _note: value }),
    priority: (a: MonitoringAlert, value: MonitoringPriority | null) => priority.mutateAsync({ _source_type: a.source_type, _source_id: a.source_id, _alert_kind: a.alert_kind, _priority_override: value }),
  };
}
