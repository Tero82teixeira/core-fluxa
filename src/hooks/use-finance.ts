import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  from: (name: string) => any;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};
export type FinanceData = {
  transactions: any[];
  categories: any[];
  accounts: any[];
  recurrences: any[];
  payments: any[];
  movements: any[];
  clients: any[];
  processes: any[];
  tasks: any[];
  documents: any[];
  members: any[];
};

export function useFinance(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["finance", organizationId],
    queryFn: async (): Promise<FinanceData> => {
      if (!organizationId) throw new Error("Selecione uma organização ativa.");
      const query = (table: string, select = "*") =>
        db.from(table).select(select).eq("organization_id", organizationId).limit(2000);
      const queryUnarchived = (table: string, select = "*") =>
        db
          .from(table)
          .select(select)
          .eq("organization_id", organizationId)
          .is("archived_at", null)
          .limit(2000);
      const results = await Promise.all([
        query("financial_transactions"),
        query("financial_categories"),
        query("financial_accounts"),
        queryUnarchived("financial_recurrences"),
        query("financial_transaction_payments"),
        query("financial_account_movements"),
        query("clients_secure", "id,name"),
        query("processes", "id,code,title"),
        query("tasks", "id,title"),
        query("documents", "id,title"),
        query("organization_members", "id,user_id,role,is_active"),
      ]);
      const failed = results.find((x) => x.error);
      if (failed?.error) throw failed.error;
      const [
        transactions,
        categories,
        accounts,
        recurrences,
        payments,
        movements,
        clients,
        processes,
        tasks,
        documents,
        members,
      ] = results.map((x) => x.data ?? []);
      return {
        transactions,
        categories,
        accounts,
        recurrences,
        payments,
        movements,
        clients,
        processes,
        tasks,
        documents,
        members,
      };
    },
  });
}

export function useFinancialAction(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ rpc, payload }: { rpc: string; payload: Record<string, unknown> }) => {
      const { data, error } = await db.rpc(rpc, {
        _organization_id: organizationId,
        _payload: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", organizationId] }),
  });
}

export function useFinancialPayment(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: "partial" | "settle" | "reverse";
      transactionId?: string;
      paymentId?: string;
      amount?: number;
      accountId?: string;
      paymentMethod?: string;
      notes?: string;
    }) => {
      const rpc =
        args.kind === "partial"
          ? "register_partial_payment"
          : args.kind === "settle"
            ? "mark_financial_transaction_paid"
            : "reverse_financial_payment";
      const rpcArgs =
        args.kind === "reverse"
          ? {
              _organization_id: organizationId,
              _payment_id: args.paymentId,
              _notes: args.notes ?? "",
            }
          : args.kind === "settle"
            ? {
                _organization_id: organizationId,
                _transaction_id: args.transactionId,
                _account_id: args.accountId,
                _payment_method: args.paymentMethod ?? null,
              }
            : {
                _organization_id: organizationId,
                _transaction_id: args.transactionId,
                _amount: args.amount,
                _account_id: args.accountId,
                _payment_method: args.paymentMethod ?? null,
                _notes: args.notes ?? null,
              };
      const { data, error } = await db.rpc(rpc, rpcArgs);
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["finance", organizationId] }),
  });
}
