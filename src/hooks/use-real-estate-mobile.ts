import { catalogManage, signedPhotos } from "./use-real-estate-catalog";
import {
  mapMobileSelection,
  publicMobileSelection,
  selectionCatalog,
  type MobilePreview,
} from "@/lib/real-estate-mobile-actions";
import type { PublicCatalog } from "@/lib/real-estate-catalog";
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
    async function preview(ids: string[]): Promise<MobilePreview[]> {
      if (!org) throw new Error("MOBILE_READ_DENIED");
      return mapMobileSelection(ids, async (property) => {
        const data = await catalogManage(org, "load", property);
        const eligible = !!(
          data.store?.is_enabled &&
          data.listing?.visible &&
          data.listing.is_published
        );
        const listing = eligible ? (await signedPhotos([data.listing!]))[0] : null;
        return {
          property_id: property,
          code: data.source?.code || "—",
          token: eligible ? data.store!.token : null,
          listing,
        };
      });
    }
    return {
      preview,
      share: async (ids, origin) => {
        const items = await preview(ids);
        const selection = selectionCatalog(items);
        const { data, error } = await supabase.rpc("real_estate_public_catalog", {
          _token: selection.token,
          _ids: selection.ids,
          _page: 1,
        });
        if (error) throw error;
        const published = data as unknown as PublicCatalog | null;
        return publicMobileSelection(origin, items, published?.items.map((i) => i.id) ?? []);
      },
      scope: org ?? "none",
      properties: async (filters, page) => {
        if (!org) throw new Error("MOBILE_READ_DENIED");
        const { data, error } = await supabase.rpc("search_real_estate_properties", {
          _organization_id: org,
          _search: filters.search || undefined,
          _type: filters.type || undefined,
          _purpose: filters.purpose || undefined,
          _max_price: filters.maxPrice ?? undefined,
          _page: page,
        });
        if (error) throw error;
        return data as unknown as MobilePage<MobileProperty>;
      },
      search: (search, page) => read<MobilePage<MobileClient>>("search", { search, page }),
      client: (client, page) => read<MobileSummary>("client", { client, page }),
      today: (start, end, page) => read<MobilePage<MobileToday>>("today", { start, end, page }),
    };
  }, [org]);
}
