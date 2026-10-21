import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  consultingSourceIdValid,
  type ConsultingProposalSource,
} from "@/lib/consulting-project-source";
export function useConsultingProposalSource(
  organizationId: string | null,
  proposalId: string | undefined | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["consulting-proposal-source", organizationId, proposalId],
    enabled: Boolean(
      enabled && organizationId && proposalId && consultingSourceIdValid(proposalId),
    ),
    queryFn: async (): Promise<ConsultingProposalSource | null> => {
      const { data, error } = await supabase
        .from("commercial_proposals")
        .select(
          "id,organization_id,client_id,converted_client_id,proposal_number,title,service_description,terms,status,archived_at",
        )
        .eq("organization_id", organizationId!)
        .eq("id", proposalId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Resolve the selected client directly; the general picker is limited to 500 rows. */
export function useConsultingSourceClient(
  organizationId: string | null,
  clientId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["consulting-source-client", organizationId, clientId],
    enabled: Boolean(enabled && organizationId && clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients_secure")
        .select("id,name,organization_id")
        .eq("organization_id", organizationId!)
        .eq("id", clientId!)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
