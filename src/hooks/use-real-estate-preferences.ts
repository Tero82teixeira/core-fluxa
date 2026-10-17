import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedPhotos } from "./use-real-estate-catalog";
import type { PreferenceResult, PropertyPreferences } from "@/lib/real-estate-preferences";
export async function managePreferences(
  org: string,
  request: string,
  action: string,
  values: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.rpc("real_estate_preferences", {
    _organization_id: org,
    _request_id: request,
    _action: action,
    _values: values as never,
  });
  if (error) throw error;
  return data as unknown as PreferenceResult & { ids?: string[] };
}
export function usePreferences(org: string | null, request: string) {
  return useQuery({
    queryKey: ["real-estate-preferences", org, request],
    enabled: Boolean(org),
    queryFn: () => managePreferences(org!, request, "load"),
  });
}
export function usePreferenceMatches(
  org: string | null,
  request: string,
  version: number,
  only: boolean,
  page: number,
) {
  return useQuery({
    queryKey: ["real-estate-matches", org, request, version, only, page],
    enabled: Boolean(org && version),
    queryFn: async () => {
      const result = await managePreferences(org!, request, "matches", {
        only_matches: only,
        page,
      });
      return { ...result, items: await signedPhotos(result.items) };
    },
    refetchInterval: 60_000,
  });
}
export function useSavePreferences(org: string | null, request: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      preferences,
      version,
    }: {
      preferences: PropertyPreferences;
      version: number;
    }) => {
      if (!org) throw new Error("DENIED");
      return managePreferences(org, request, "save", { preferences, version });
    },
    onSuccess: (data) => {
      client.setQueryData(["real-estate-preferences", org, request], data);
      void client.invalidateQueries({ queryKey: ["real-estate-matches", org, request] });
    },
  });
}
