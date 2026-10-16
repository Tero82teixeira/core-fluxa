import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CATALOG_BUCKET,
  prepareCatalogPhoto,
  type CatalogListing,
  type ManagedCatalog,
  type PublicCatalog,
} from "@/lib/real-estate-catalog";

export async function catalogManage(
  org: string,
  action: string,
  property: string | null,
  values: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.rpc("real_estate_catalog_manage", {
    _organization_id: org,
    _action: action,
    _property_id: property || undefined,
    _values: values as never,
  });
  if (error) throw error;
  return data as unknown as ManagedCatalog;
}
async function signedPhotos<T extends CatalogListing>(items: T[]): Promise<T[]> {
  const paths = [...new Set(items.flatMap((item) => item.photos.map((photo) => photo.path)))];
  if (!paths.length) return items;
  const { data } = await supabase.storage.from(CATALOG_BUCKET).createSignedUrls(paths, 120);
  const urls = new Map((data || []).map((photo) => [photo.path, photo.signedUrl]));
  return items.map((item) => ({
    ...item,
    photos: item.photos.map((photo) => ({ ...photo, url: urls.get(photo.path) })),
  }));
}
export function useManagedCatalog(org: string | null, property: string | null, page: number) {
  return useQuery({
    queryKey: ["real-estate-catalog", org, property, page],
    enabled: Boolean(org),
    queryFn: async () => {
      const result = await catalogManage(org!, "load", property, { page });
      return {
        ...result,
        listing: result.listing ? (await signedPhotos([result.listing]))[0] : null,
        items: await signedPhotos(
          result.items.map((item) => ({ ...item, photos: item.photos.slice(0, 1) })),
        ),
      };
    },
    refetchInterval: 60_000,
  });
}
export function useSaveCatalog(org: string | null, property: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: { action: string; values?: Record<string, unknown> }) => {
      if (!org) throw new Error("CATALOG_READ_DENIED");
      const result = await catalogManage(org, args.action, property, args.values);
      if (result.removed_path)
        await supabase.storage.from(CATALOG_BUCKET).remove([result.removed_path]);
      return result;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["real-estate-catalog", org] }),
  });
}
export function useUploadCatalogPhoto(
  org: string | null,
  property: string | null,
  listing: string | null,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption: string }) => {
      if (!org || !property || !listing) throw new Error("CATALOG_DRAFT_REQUIRED");
      const blob = await prepareCatalogPhoto(file);
      const path = `${listing}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage
        .from(CATALOG_BUCKET)
        .upload(path, blob, { contentType: "image/webp", upsert: false, cacheControl: "60" });
      if (error) throw error;
      try {
        return await catalogManage(org, "add_photo", property, { path, caption });
      } catch (error) {
        await supabase.storage.from(CATALOG_BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["real-estate-catalog", org] }),
  });
}
export type PublicCatalogFilters = {
  purpose: string;
  type: string;
  maxPrice: number | null;
  search: string;
  page: number;
};
export function usePublicCatalog(
  token: string,
  ids: string[] | null | undefined,
  filters: PublicCatalogFilters,
) {
  return useQuery({
    queryKey: ["real-estate-public-catalog", token, ids, filters],
    enabled: ids !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("real_estate_public_catalog", {
        _token: token,
        _ids: ids ?? undefined,
        _page: filters.page,
        _purpose: filters.purpose || undefined,
        _type: filters.type || undefined,
        _max_price: filters.maxPrice ?? undefined,
        _search: filters.search || undefined,
      });
      if (error) throw error;
      if (!data) return null;
      const result = data as unknown as PublicCatalog;
      return { ...result, items: await signedPhotos(result.items) };
    },
    refetchInterval: 60_000,
  });
}
