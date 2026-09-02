import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type ClientPortalInvitation = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
};

export type ClientPortalAccess = {
  id: string;
  email: string;
  is_active: boolean;
  accepted_at: string;
  updated_at: string;
};

const portalKey = (organizationId: string | null, clientId: string) => [
  "client-portal",
  organizationId,
  clientId,
];

export function useClientPortal(organizationId: string | null, clientId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(organizationId && clientId),
    queryKey: portalKey(organizationId, clientId),
    queryFn: async () => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const [invitations, accesses] = await Promise.all([
        supabase
          .from("client_portal_invitations")
          .select("id, email, status, expires_at, created_at, accepted_at, cancelled_at")
          .eq("organization_id", organizationId)
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_portal_access")
          .select("id, email, is_active, accepted_at, updated_at")
          .eq("organization_id", organizationId)
          .eq("client_id", clientId)
          .order("accepted_at", { ascending: false }),
      ]);
      if (invitations.error) throw invitations.error;
      if (accesses.error) throw accesses.error;
      return {
        invitations: (invitations.data ?? []) as ClientPortalInvitation[],
        accesses: (accesses.data ?? []) as ClientPortalAccess[],
      };
    },
  });
}

export function useCreateClientPortalInvitation(organizationId: string | null, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      if (!organizationId) throw new Error("Empresa ativa não encontrada.");
      const { data, error } = await supabase.rpc("create_client_portal_invitation", {
        _organization_id: organizationId,
        _client_id: clientId,
        _email: email.trim(),
      });
      if (error) throw error;
      const invitation = data?.[0];
      if (!invitation?.invitation_id || !invitation.token || !invitation.expires_at)
        throw new Error("PORTAL_INVITE_EMPTY_RESULT");
      return {
        id: invitation.invitation_id,
        expiresAt: invitation.expires_at,
        url: new URL(
          `/portal-do-cliente/${encodeURIComponent(invitation.token)}`,
          window.location.origin,
        ).toString(),
      };
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: portalKey(organizationId, clientId) }),
  });
}

export function useCancelClientPortalInvitation(organizationId: string | null, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase.rpc("cancel_client_portal_invitation", {
        _invitation_id: invitationId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: portalKey(organizationId, clientId) }),
  });
}

export function useSetClientPortalAccessActive(organizationId: string | null, clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessId, active }: { accessId: string; active: boolean }) => {
      const { error } = await supabase.rpc("set_client_portal_access_active", {
        _access_id: accessId,
        _active: active,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: portalKey(organizationId, clientId) }),
  });
}
