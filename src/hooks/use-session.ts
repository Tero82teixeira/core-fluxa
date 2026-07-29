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
  role: AppRole;
  organizations: {
    id: string;
    legal_name: string;
    trade_name: string | null;
    onboarding_completed: boolean;
  } | null;
};

/** Workspaces (empresas) das quais o usuário autenticado participa. */
export function useMemberships() {
  return useQuery({
    queryKey: ["memberships"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, organization_id, role, organizations(id, legal_name, trade_name, onboarding_completed)")
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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", user!.id)
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
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .eq("role", role!);
      if (error) throw error;
      return (data ?? []).map((r) => r.permission_key as PermissionKey);
    },
  });
}
