import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AutomationAction, AutomationCondition, AutomationTrigger } from "@/lib/automations";

const db = supabase as unknown as {
  from: (name: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => any;
};
export type AutomationRule = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_type: AutomationTrigger;
  conditions: AutomationCondition[];
  action_type: AutomationAction;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_by: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  last_executed_at: string | null;
  execution_count: number;
  failure_count: number;
};
export type AutomationExecution = {
  id: string;
  automation_rule_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  status: "running" | "success" | "failed" | "skipped";
  error_message: string | null;
  output_payload: { action?: AutomationAction } | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};
export type AutomationInput = Pick<
  AutomationRule,
  | "name"
  | "description"
  | "trigger_type"
  | "conditions"
  | "action_type"
  | "action_config"
  | "is_active"
>;

export function useAutomationRules(organizationId: string | null) {
  return useQuery({
    queryKey: ["automation-rules", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await db
        .from("automation_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AutomationRule[];
    },
  });
}
export function useAutomationExecutions(organizationId: string | null, ruleId?: string | null) {
  return useQuery({
    queryKey: ["automation-executions", organizationId, ruleId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      let q = db
        .from("automation_executions")
        .select(
          "id, automation_rule_id, event_type, entity_type, entity_id, status, error_message, output_payload, started_at, finished_at, created_at",
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (ruleId) q = q.eq("automation_rule_id", ruleId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AutomationExecution[];
    },
  });
}
function useRpcMutation(rpc: string, organizationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(rpc, args);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["automation-rules", organizationId] });
      void qc.invalidateQueries({ queryKey: ["automation-executions", organizationId] });
    },
  });
}
export function useCreateAutomationRule(org: string | null) {
  const m = useRpcMutation("create_automation_rule", org);
  return {
    ...m,
    mutateAsync: (input: AutomationInput) => m.mutateAsync({ _organization_id: org, ...input }),
  };
}
export function useUpdateAutomationRule(org: string | null) {
  const m = useRpcMutation("update_automation_rule", org);
  return {
    ...m,
    mutateAsync: (id: string, input: AutomationInput) => m.mutateAsync({ _rule_id: id, ...input }),
  };
}
export function useSetAutomationRuleActive(org: string | null) {
  const m = useRpcMutation("set_automation_rule_active", org);
  return {
    ...m,
    mutateAsync: (id: string, active: boolean) =>
      m.mutateAsync({ _rule_id: id, _is_active: active }),
  };
}
export function useDuplicateAutomationRule(org: string | null) {
  const m = useRpcMutation("duplicate_automation_rule", org);
  return { ...m, mutateAsync: (id: string) => m.mutateAsync({ _rule_id: id }) };
}
export function useArchiveAutomationRule(org: string | null) {
  const m = useRpcMutation("archive_automation_rule", org);
  return { ...m, mutateAsync: (id: string) => m.mutateAsync({ _rule_id: id }) };
}
