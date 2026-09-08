import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const db = () => supabase as any;
const PUSH_STATE_EVENT = "fluxa:push-subscription-changed";
function decodePublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
function supported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePushNotifications(organizationId: string | null) {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === "undefined" ? "default" : Notification.permission,
  );
  const refresh = useCallback(async () => {
    if (!supported()) {
      setActive(false);
      return;
    }
    setPermission(Notification.permission);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      setActive(Boolean(await registration?.pushManager.getSubscription()));
    } catch {
      setActive(false);
    }
  }, []);
  useEffect(() => {
    setActive(null);
    void refresh();
    const handleChange = () => void refresh();
    window.addEventListener(PUSH_STATE_EVENT, handleChange);
    return () => window.removeEventListener(PUSH_STATE_EVENT, handleChange);
  }, [organizationId, refresh]);
  const enable = async () => {
    if (!organizationId || !supported()) throw new Error("PUSH_NOT_SUPPORTED");
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
      const { error: registerError } = await db().rpc("register_push_subscription", {
        _organization_id: organizationId,
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
  const disable = async () => {
    if (!organizationId || !supported()) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { error } = await db().rpc("remove_push_subscription", {
          _organization_id: organizationId,
          _endpoint: subscription.endpoint,
        });
        if (error) throw error;
        await subscription.unsubscribe();
      }
      setActive(false);
      window.dispatchEvent(new Event(PUSH_STATE_EVENT));
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
    const { data, error } = await supabase.functions.invoke("communication-push", {
      body: { mode: "test", organizationId },
    });
    if (error) throw error;
    return Number(data?.delivered ?? 0);
  };
  return {
    supported: supported(),
    permission,
    active,
    checking: active === null,
    busy,
    enable,
    disable,
    test,
    refresh,
  };
}
