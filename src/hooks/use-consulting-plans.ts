import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizedMonthlyPlan,
  type MonthlyPlanValues,
  type MonthlyWorkspace,
  type PlanOverview,
} from "@/lib/consulting-plans";
const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
async function call<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpc.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export function useMonthlyPlan(org: string | null, process: string, reference: string) {
  return useQuery({
    queryKey: ["consulting-plan", org, process, reference],
    enabled: Boolean(org && process),
    queryFn: () =>
      call<MonthlyWorkspace>("read_consulting_plans", {
        _organization_id: org,
        _process_id: process,
        _reference: reference,
      }),
  });
}
export function useMonthlyPlansOverview(org: string | null, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ["consulting-plans", org, page],
    enabled: Boolean(org && enabled),
    queryFn: () =>
      call<PlanOverview>("read_consulting_plans", { _organization_id: org, _page: page }),
  });
}
export function useSaveMonthlyPlan(org: string | null, process: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ values, revision }: { values: MonthlyPlanValues; revision: number | null }) =>
      call("save_consulting_monthly_plan", {
        _organization_id: org,
        _process_id: process,
        _values: normalizedMonthlyPlan(values),
        _expected_revision: revision,
      }),
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: ["consulting-day", org] });
      cache.invalidateQueries({ queryKey: ["consulting-plan", org, process] });
      cache.invalidateQueries({ queryKey: ["consulting-plans", org] });
    },
  });
}
export function useGeneratePlanMonth(org: string | null, process: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) =>
      call<{ created: number; existing: number }>("generate_consulting_plan_month", {
        _organization_id: org,
        _process_id: process,
        _reference: reference,
      }),
    onSuccess: () => {
      for (const key of [
        ["consulting-plan", org, process],
        ["tasks", org],
        ["task-list", org],
        ["reports", org],
        ["activity", org],
        ["task-board", org],
        ["global-search", org],
      ])
        cache.invalidateQueries({ queryKey: key });
    },
  });
}
