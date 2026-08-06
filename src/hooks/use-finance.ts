import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from:(name:string)=>any; rpc:(name:string,args?:Record<string,unknown>)=>Promise<{data:any;error:any}> };
export type FinanceData = { transactions:any[]; categories:any[]; accounts:any[]; recurrences:any[]; payments:any[]; movements:any[]; clients:any[]; processes:any[]; tasks:any[]; documents:any[]; members:any[] };

export function useFinance(organizationId:string|null) {
  return useQuery({ enabled:Boolean(organizationId), queryKey:["finance",organizationId], queryFn:async():Promise<FinanceData> => {
    if (!organizationId) throw new Error("Selecione uma organização ativa.");
    const query=(table:string,select="*")=>db.from(table).select(select).eq("organization_id",organizationId).limit(2000);
    const results=await Promise.all([
      query("financial_transactions"),query("financial_categories"),query("financial_accounts"),query("financial_recurrences"),query("financial_transaction_payments"),query("financial_account_movements"),
      query("clients_secure","id,name"),query("processes","id,code,title"),query("tasks","id,title"),query("documents","id,title"),query("organization_members","id,user_id,role,is_active")
    ]);
    const failed=results.find(x=>x.error); if(failed?.error) throw failed.error;
    const [transactions,categories,accounts,recurrences,payments,movements,clients,processes,tasks,documents,members]=results.map(x=>x.data??[]);
    return {transactions,categories,accounts,recurrences,payments,movements,clients,processes,tasks,documents,members};
  }});
}

export function useFinancialAction(organizationId:string|null) {
  const client=useQueryClient();
  return useMutation({ mutationFn:async({rpc,payload}:{rpc:string;payload:Record<string,unknown>})=>{ const {data,error}=await db.rpc(rpc,{_organization_id:organizationId,_payload:payload}); if(error) throw error; return data; }, onSuccess:()=>client.invalidateQueries({queryKey:["finance",organizationId]}) });
}

export function useFinancialPayment(organizationId:string|null) {
  const client=useQueryClient();
  return useMutation({ mutationFn:async(args:{transactionId:string;amount:number;accountId:string;notes?:string})=>{ const {data,error}=await db.rpc("register_partial_payment",{_organization_id:organizationId,_transaction_id:args.transactionId,_amount:args.amount,_account_id:args.accountId,_payment_method:null,_notes:args.notes??null}); if(error) throw error; return data; }, onSuccess:()=>client.invalidateQueries({queryKey:["finance",organizationId]}) });
}
