import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { prepareCatalogPhoto } from "@/lib/real-estate-catalog";
import {
  BRANDING_BUCKET,
  profileValues,
  type BusinessProfile,
  type PublicBusinessProfile,
} from "@/lib/real-estate-profile";
export type ProfileFiles = { logo: File | null; agent: File | null };
async function withProfileImages<T extends PublicBusinessProfile>(profile: T | null) {
  if (!profile) return null;
  const paths = [profile.logo_path, profile.agent_photo_path].filter((v): v is string =>
    Boolean(v),
  );
  if (!paths.length) return profile;
  const { data } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrls(paths, 120);
  const urls = new Map((data || []).map((v) => [v.path, v.signedUrl]));
  return {
    ...profile,
    logo_url: profile.logo_path ? urls.get(profile.logo_path) || undefined : undefined,
    agent_photo_url: profile.agent_photo_path
      ? urls.get(profile.agent_photo_path) || undefined
      : undefined,
  };
}
async function manage(org: string, action: string, values: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc("real_estate_profile_manage", {
    _organization_id: org,
    _action: action,
    _values: values as never,
  });
  if (error) throw error;
  return data as unknown as { profile: BusinessProfile | null; removed_paths: string[] };
}
export function useBusinessProfile(org: string | null) {
  return useQuery({
    queryKey: ["real-estate-business-profile", org],
    enabled: Boolean(org),
    queryFn: async () => withProfileImages((await manage(org!, "load")).profile),
    refetchInterval: 60_000,
  });
}
export function usePublicBusinessProfile(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ["real-estate-public-profile", token],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("real_estate_public_profile", { _token: token });
      if (error) throw error;
      return withProfileImages(data as unknown as PublicBusinessProfile | null);
    },
    refetchInterval: 60_000,
  });
}
export function useSaveBusinessProfile(org: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ profile, files }: { profile: BusinessProfile; files: ProfileFiles }) => {
      const uploaded: string[] = [];
      const next = { ...profile };
      profileValues(next);
      try {
        for (const [key, file] of [
          ["logo_path", files.logo],
          ["agent_photo_path", files.agent],
        ] as const) {
          if (!file) continue;
          const blob = await prepareCatalogPhoto(file);
          const path = `${org}/${crypto.randomUUID()}.webp`;
          const { error } = await supabase.storage
            .from(BRANDING_BUCKET)
            .upload(path, blob, { contentType: "image/webp", upsert: false, cacheControl: "60" });
          if (error) throw error;
          uploaded.push(path);
          next[key] = path;
        }
        const result = await manage(org, "save", profileValues(next));
        // O banco só permite remover arquivos que já não são referenciados por perfil algum.
        if (result.removed_paths.length)
          await supabase.storage.from(BRANDING_BUCKET).remove(result.removed_paths);
        return result;
      } catch (error) {
        if (uploaded.length) await supabase.storage.from(BRANDING_BUCKET).remove(uploaded);
        throw error;
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["real-estate-business-profile", org] }),
  });
}
