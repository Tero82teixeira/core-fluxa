import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, PermissionKey } from "@/lib/domain";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: AppRole;
  is_active: boolean;
  organizations: {
    id: string;
    legal_name: string;
    trade_name: string | null;
    document: string | null;
    phone: string | null;
    whatsapp: string | null;
    onboarding_completed: boolean;
    onboarding_completed_at: string | null;
    onboarding_step: number;
    organization_settings: {
      zip_code: string | null;
      street: string | null;
      number: string | null;
      district: string | null;
      city: string | null;
      state: string | null;
      main_services: string | null;
      clients_range: string | null;
      employees_range: string | null;
    } | null;
  } | null;
};

/** Workspaces (empresas) das quais o usuário autenticado participa. */
export function useMemberships(user: User | null) {
  return useQuery({
    enabled: Boolean(user),
    queryKey: ["memberships", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select(
          "id, organization_id, user_id, role, is_active, organizations(id, legal_name, trade_name, document, phone, whatsapp, onboarding_completed, onboarding_completed_at, onboarding_step, organization_settings(zip_code, street, number, district, city, state, main_services, clients_range, employees_range))",
        )
        .eq("user_id", user?.id ?? "")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });
}

export function useProfile(user: User | null) {
  return useQuery({
    enabled: Boolean(user),
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRolePermissions(role?: AppRole) {
  return useQuery({
    enabled: Boolean(role),
    queryKey: ["role-permissions", role],
    queryFn: async () => {
      if (!role) return [];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .eq("role", role);
      if (error) throw error;
      return (data ?? []).map((r) => r.permission_key as PermissionKey);
    },
  });
}
