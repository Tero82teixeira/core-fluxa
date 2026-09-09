import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const db = () => supabase as any;
const PUSH_STATE_EVENT = "fluxa:push-subscription-changed";

export type PortalRating = {
  thread_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type PortalCallbackRequest = {
  request_id: string;
  access_id: string;
  thread_id: string | null;
  organization_name: string;
  client_name: string;
  requested_for: string;
  reason: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  staff_notes: string | null;
  created_at: string;
};

export type StaffPortalCallbackRequest = {
  request_id: string;
  client_id: string;
  client_name: string;
  thread_id: string | null;
  task_id: string | null;
  requested_for: string;
  reason: string;
  status: PortalCallbackRequest["status"];
  assigned_to: string | null;
  assigned_name: string;
  staff_notes: string | null;
  created_at: string;
};

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function decodePublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function useClientPortalPushNotifications(enabled: boolean) {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === "undefined" ? "default" : Notification.permission,
  );
  const refresh = useCallback(async () => {
    if (!pushSupported()) return setActive(false);
    setPermission(Notification.permission);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      setActive(Boolean(await registration?.pushManager.getSubscription()));
    } catch {
      setActive(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const handleChange = () => void refresh();
    window.addEventListener(PUSH_STATE_EVENT, handleChange);
    return () => window.removeEventListener(PUSH_STATE_EVENT, handleChange);
  }, [enabled, refresh]);

  const enable = async () => {
    if (!enabled || !pushSupported()) throw new Error("PUSH_NOT_SUPPORTED");
    setBusy(true);
    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") throw new Error("PUSH_PERMISSION_DENIED");
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const { data, error } = await supabase.functions.invoke("communication-push", {
        body: { mode: "public-key" },
      });
      if (error || typeof data?.publicKey !== "string")
        throw error ?? new Error("PUSH_NOT_CONFIGURED");
      const current = await registration.pushManager.getSubscription();
      const subscription =
        current ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodePublicKey(data.publicKey),
        }));
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
        throw new Error("PUSH_SUBSCRIPTION_INVALID");
      const { error: registerError } = await db().rpc("register_client_portal_push_subscription", {
        _endpoint: json.endpoint,
        _p256dh: json.keys.p256dh,
        _auth_key: json.keys.auth,
        _user_agent: navigator.userAgent,
      });
      if (registerError) throw registerError;
      setActive(true);
      window.dispatchEvent(new Event(PUSH_STATE_EVENT));
    } finally {
      setBusy(false);
    }
  };

  return {
    supported: pushSupported(),
    permission,
    active,
    checking: active === null,
    busy,
    enable,
  };
}

export function useClientPortalRatings(enabled: boolean, identityScope: string | null) {
  return useQuery({
    enabled: enabled && Boolean(identityScope),
    queryKey: ["client-portal-ratings", identityScope],
    queryFn: async (): Promise<PortalRating[]> => {
      const { data, error } = await db().rpc("client_portal_communication_ratings");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSubmitClientPortalRating(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      threadId,
      rating,
      comment,
    }: {
      threadId: string;
      rating: number;
      comment: string;
    }) => {
      const { data, error } = await db().rpc("submit_client_portal_communication_rating", {
        _thread_id: threadId,
        _rating: rating,
        _comment: comment || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-portal-ratings", identityScope] }),
  });
}

export function useClientPortalCallbacks(enabled: boolean, identityScope: string | null) {
  return useQuery({
    enabled: enabled && Boolean(identityScope),
    queryKey: ["client-portal-callbacks", identityScope],
    queryFn: async (): Promise<PortalCallbackRequest[]> => {
      const { data, error } = await db().rpc("list_client_portal_callback_requests");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateClientPortalCallback(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: {
      accessId: string;
      threadId: string | null;
      requestedFor: string;
      reason: string;
    }) => {
      const { data, error } = await db().rpc("create_client_portal_callback_request", {
        _access_id: value.accessId,
        _thread_id: value.threadId,
        _requested_for: value.requestedFor,
        _reason: value.reason,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-portal-callbacks", identityScope] }),
  });
}

export function useCancelClientPortalCallback(identityScope: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await db().rpc("cancel_client_portal_callback_request", {
        _request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-portal-callbacks", identityScope] }),
  });
}

export function useStaffPortalCallbacks(organizationId: string | null, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["staff-portal-callbacks", organizationId],
    queryFn: async (): Promise<StaffPortalCallbackRequest[]> => {
      const { data, error } = await db().rpc("list_staff_client_portal_callback_requests", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateStaffPortalCallback(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: {
      requestId: string;
      status: "confirmed" | "completed" | "cancelled";
      notes?: string;
    }) => {
      const { error } = await db().rpc("update_staff_client_portal_callback_request", {
        _organization_id: organizationId,
        _request_id: value.requestId,
        _status: value.status,
        _staff_notes: value.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["staff-portal-callbacks", organizationId] }),
  });
}
