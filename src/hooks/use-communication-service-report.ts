import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CommunicationServiceMetrics = {
  conversations: number;
  resolved: number;
  waiting_team: number;
  average_first_response_minutes: number;
  by_channel: Record<string, number>;
  faq_views: number;
  faq_helpful: number;
  faq_not_helpful: number;
  faq_escalated: number;
  faq_clients: number;
  faq_deflection_rate: number;
  channel_inbound: number;
  channel_outbound: number;
  channel_failed: number;
  channel_pending_match: number;
};

export function useCommunicationServiceReport(
  organizationId: string | null,
  from: Date,
  to: Date,
  enabled = true,
) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: [
      "communication-service-report",
      organizationId,
      from.toISOString(),
      to.toISOString(),
    ],
    queryFn: async () => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await supabase.rpc("communication_service_metrics", {
        _organization_id: organizationId,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) throw error;
      return data as unknown as CommunicationServiceMetrics;
    },
  });
}
