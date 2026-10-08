import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PropertyValues } from "@/lib/real-estate";
export type PropertyRow = PropertyValues & {
  id: string;
  organization_id: string;
  version: number;
  owner_name: string | null;
  responsible_name: string | null;
  updated_at: string;
  created_at: string;
};
export type PropertyFilters = {
  search: string;
  type: string;
  purpose: string;
  status: string;
  city: string;
  page: number;
};
export type PropertyPage = {
  items: PropertyRow[];
  total: number;
  available: number;
  reserved: number;
};
type Options = {
  owners: { id: string; name: string }[];
  responsibles: { id: string; name: string }[];
  cities: string[];
};
const rpc = supabase as unknown as {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
export function useProperties(org: string | null, filters: PropertyFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["real-estate-properties", org, filters],
    enabled: Boolean(org) && enabled,
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_real_estate_properties", {
        _organization_id: org,
        _search: filters.search || null,
        _type: filters.type || null,
        _purpose: filters.purpose || null,
        _status: filters.status || null,
        _city: filters.city || null,
        _page: filters.page,
      });
      if (error) throw error;
      return data as PropertyPage;
    },
  });
}
export function usePropertyOptions(org: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["real-estate-options", org],
    enabled: Boolean(org) && enabled,
    queryFn: async () => {
      const { data, error } = await rpc.rpc("real_estate_form_options", { _organization_id: org });
      if (error) throw error;
      return data as Options;
    },
  });
}
export function useSaveProperty(org: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; version: number | null; values: PropertyValues }) => {
      const { data, error } = await rpc.rpc("save_real_estate_property", {
        _organization_id: org,
        _id: args.id,
        _expected_version: args.version,
        _values: args.values,
      });
      if (error) throw error;
      return data as PropertyRow;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["real-estate-properties", org] });
      await client.invalidateQueries({ queryKey: ["real-estate-options", org] });
    },
  });
}
