import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  CommercialContactChannel,
  CommercialFollowUpStatus,
} from "@/lib/commercial-follow-up";

type ContactHistoryRow = {
  id: string;
  status: CommercialFollowUpStatus;
  channel: CommercialContactChannel;
  notes: string;
  next_contact_at: string | null;
  contacted_at: string;
  created_by: string;
  created_by_name: string | null;
};

type SaveContact = {
  status: CommercialFollowUpStatus;
  channel: CommercialContactChannel;
  notes: string;
  nextContactAt: string | null;
};

const db = () => supabase as any;

export type PlatformTrialFollowUpAlert = {
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  effective_status: string;
  follow_up_status: CommercialFollowUpStatus;
  next_contact_at: string | null;
};

export function usePlatformTrialFollowUpAlerts(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["platform-organizations"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc("platform_organizations");
      if (error) throw error;
      return (data ?? []) as PlatformTrialFollowUpAlert[];
    },
  });
}

export function usePlatformTrialContactHistory(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["platform-trial-contact-history", organizationId],
    queryFn: async () => {
      const { data, error } = await db().rpc("platform_trial_contact_history", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as ContactHistoryRow[];
    },
  });
}

export function useSavePlatformTrialFollowUp(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      value: SaveContact & { registerContact: boolean; summaryNotes?: string | null },
    ) => {
      if (!organizationId) throw new Error("Selecione uma empresa.");
      const { error } = await db().rpc("save_platform_trial_follow_up", {
        _organization_id: organizationId,
        _status: value.status,
        _next_contact_at: value.nextContactAt ? new Date(value.nextContactAt).toISOString() : null,
        _notes: value.summaryNotes ?? value.notes,
        _channel: value.registerContact ? value.channel : null,
        _register_contact: value.registerContact,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-organizations"] }),
        queryClient.invalidateQueries({
          queryKey: ["platform-trial-contact-history", organizationId],
        }),
      ]);
    },
  });
}

export function useCommercialOpportunityContacts(
  organizationId: string | null,
  opportunityId: string | null,
  enabled: boolean,
) {
  return useQuery({
    enabled: enabled && Boolean(organizationId && opportunityId),
    queryKey: ["commercial-opportunity-contacts", organizationId, opportunityId],
    queryFn: async () => {
      const { data, error } = await db().rpc("commercial_opportunity_contacts", {
        _organization_id: organizationId,
        _opportunity_id: opportunityId,
      });
      if (error) throw error;
      return (data ?? []) as ContactHistoryRow[];
    },
  });
}

export function useSaveCommercialOpportunityContact(
  organizationId: string | null,
  opportunityId: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: SaveContact) => {
      if (!organizationId || !opportunityId) throw new Error("Selecione uma oportunidade.");
      const { error } = await db().rpc("save_commercial_opportunity_contact", {
        _organization_id: organizationId,
        _opportunity_id: opportunityId,
        _status: value.status,
        _channel: value.channel,
        _notes: value.notes,
        _next_contact_at: value.nextContactAt ? new Date(value.nextContactAt).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reports", organizationId] }),
        queryClient.invalidateQueries({
          queryKey: ["commercial-opportunity-contacts", organizationId, opportunityId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["commercial-opportunity-alerts", organizationId],
        }),
      ]);
    },
  });
}

export type { ContactHistoryRow, SaveContact };
