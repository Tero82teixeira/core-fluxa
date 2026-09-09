import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type ClientPortalFaqArticle = {
  id: string;
  title: string;
  answer: string;
  category: string;
  keywords: string[];
  sort_order?: number;
  is_published?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ClientPortalFaqInput = {
  id?: string | null;
  title: string;
  answer: string;
  category: string;
  keywords: string[];
  sortOrder: number;
  isPublished: boolean;
};

export function useClientPortalFaqArticles(organizationId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(organizationId),
    queryKey: ["client-portal-faq-admin", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("list_client_portal_faq_articles", {
        _organization_id: organizationId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ClientPortalFaqArticle[];
    },
  });
}

export function useSaveClientPortalFaqArticle(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientPortalFaqInput) => {
      if (!organizationId) throw new Error("ORGANIZATION_REQUIRED");
      const { data, error } = await supabase.rpc("save_client_portal_faq_article", {
        _organization_id: organizationId,
        _article_id: input.id ?? (null as unknown as string),
        _title: input.title.trim(),
        _answer: input.answer.trim(),
        _category: input.category.trim(),
        _keywords: input.keywords,
        _sort_order: input.sortOrder,
        _is_published: input.isPublished,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["client-portal-faq-admin", organizationId] }),
  });
}

export function useMyClientPortalFaqArticles(accessId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(accessId),
    queryKey: ["client-portal-faq", accessId],
    queryFn: async () => {
      if (!accessId) return [];
      const { data, error } = await supabase.rpc("list_my_client_portal_faq_articles", {
        _access_id: accessId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ClientPortalFaqArticle[];
    },
  });
}

export function useRecordClientPortalFaqEvent(accessId: string | null) {
  return useMutation({
    mutationFn: async ({
      articleId,
      eventType,
      searchTerm,
    }: {
      articleId?: string | null;
      eventType: "view" | "helpful" | "not_helpful" | "escalated" | "search";
      searchTerm?: string | null;
    }) => {
      if (!accessId) throw new Error("PORTAL_ACCESS_REQUIRED");
      const { error } = await supabase.rpc("record_my_client_portal_faq_event", {
        _access_id: accessId,
        _article_id: articleId ?? (null as unknown as string),
        _event_type: eventType,
        _search_term: searchTerm ?? (null as unknown as string),
      });
      if (error) throw error;
    },
  });
}
