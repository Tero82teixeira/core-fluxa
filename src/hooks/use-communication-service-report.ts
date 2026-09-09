import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const db = () => supabase as any;

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
  rating_average: number;
  rating_count: number;
  rating_five_star: number;
  callback_requested: number;
  callback_pending: number;
  callback_completed: number;
};

export type CommunicationRatingDetail = {
  rating_id: string;
  client_id: string;
  client_name: string;
  thread_id: string;
  subject: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunicationServiceReportData = CommunicationServiceMetrics & {
  ratings: CommunicationRatingDetail[];
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
      const parameters = {
        _organization_id: organizationId,
        _from: from.toISOString(),
        _to: to.toISOString(),
      };
      const [service, experience, ratings] = await Promise.all([
        supabase.rpc("communication_service_metrics", parameters),
        db().rpc("communication_experience_metrics", parameters),
        db().rpc("list_staff_client_portal_communication_ratings", parameters),
      ]);
      if (service.error) throw service.error;
      if (experience.error) throw experience.error;
      if (ratings.error) throw ratings.error;
      return {
        ...(service.data as object),
        ...(experience.data as object),
        ratings: (ratings.data ?? []) as CommunicationRatingDetail[],
      } as CommunicationServiceReportData;
    },
  });
}
