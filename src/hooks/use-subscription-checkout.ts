import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useOrganizationSubscription } from "@/hooks/use-subscription";
import {
  buildKiwifyCheckoutUrl,
  canManageSubscription,
  canRestartKiwifyCheckout,
} from "@/lib/billing";
import { describeError } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";

export function useSubscriptionCheckout() {
  const { organizationId, role, user, displayName } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const canManage = Boolean(organizationId && canManageSubscription(role));
  const subscription = useOrganizationSubscription(organizationId, canManage);
  const canSubscribe = Boolean(
    canManage &&
    !subscription.isLoading &&
    !subscription.isError &&
    canRestartKiwifyCheckout(
      subscription.data?.status ?? null,
      subscription.data?.access_until ?? null,
    ),
  );

  const openCheckout = async () => {
    if (!organizationId || !canSubscribe || loading) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc("prepare_kiwify_checkout", {
        _organization: organizationId,
      });
      if (error) throw error;

      window.location.assign(
        buildKiwifyCheckoutUrl({
          organizationId,
          email: user?.email,
          name: displayName,
        }),
      );
    } catch (error) {
      console.error("Não foi possível abrir o checkout da Kiwify", error);
      toast.error(describeError(error));
      setLoading(false);
    }
  };

  return { canSubscribe, loading, openCheckout };
}
