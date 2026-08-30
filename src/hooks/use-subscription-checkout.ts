import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { buildKiwifyCheckoutUrl, canManageSubscription } from "@/lib/billing";
import { useWorkspace } from "@/lib/workspace";

export function useSubscriptionCheckout() {
  const { organizationId, role, user, displayName } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const canSubscribe = Boolean(organizationId && canManageSubscription(role));

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
      toast.error("Não foi possível iniciar a assinatura. Tente novamente.");
      setLoading(false);
    }
  };

  return { canSubscribe, loading, openCheckout };
}
