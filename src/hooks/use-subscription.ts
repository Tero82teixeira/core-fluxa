import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type OrganizationSubscription = Tables<"organization_subscriptions">;

export function useOrganizationSubscription(
  organizationId: string | null,
  canReadSubscription: boolean,
) {
  return useQuery({
    queryKey: ["organization-subscription", organizationId],
    enabled: Boolean(organizationId && canReadSubscription),
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select(
          "id, organization_id, provider, status, billing_email, provider_subscription_id, provider_order_id, last_event_type, last_event_at, checkout_started_at, access_until, next_payment_at, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
