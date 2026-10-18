import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  MobileClient,
  MobileProperty,
  MobilePage,
  MobileSource,
  MobileSummary,
  MobileToday,
} from "@/lib/real-estate-mobile";
export function useRealEstateMobile(org: string | null): MobileSource {
  return useMemo(() => {
    async function read<T>(action: string, values: Json): Promise<T> {
      if (!org) throw new Error("MOBILE_READ_DENIED");
      const { data, error } = await supabase.rpc("real_estate_mobile", {
        _organization_id: org,
        _action: action,
        _values: values,
      });
      if (error) throw error;
      return data as unknown as T;
    }
    return {
      scope: org ?? "none",
      properties: (search, page) =>
        read<MobilePage<MobileProperty>>("properties", { search, page }),
      search: (search, page) => read<MobilePage<MobileClient>>("search", { search, page }),
      client: (client, page) => read<MobileSummary>("client", { client, page }),
      today: (start, end, page) => read<MobilePage<MobileToday>>("today", { start, end, page }),
    };
  }, [org]);
}
