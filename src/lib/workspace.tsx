import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useMemberships, useProfile, useRolePermissions, type Membership } from "@/hooks/use-session";
import type { AppRole, PermissionKey } from "@/lib/domain";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logTechnical } from "@/lib/errors";

const STORAGE_KEY = "fluxa-workspace";

type WorkspaceContextValue = {
  status: "loading" | "bootstrapping" | "ready" | "error";
  loading: boolean;
  bootstrapping: boolean;
  ready: boolean;
  user: User | null;

  displayName: string;
  memberships: Membership[];
  membership: Membership | null;
  organizationId: string | null;
  role: AppRole | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  bootstrapError: string | null;
  can: (permission: PermissionKey) => boolean;
  switchWorkspace: (organizationId: string) => void;
  ensureWorkspace: () => Promise<Membership>;
  refreshWorkspace: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const memberships = useMemberships(user);
  const profile = useProfile(user);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const bootstrapPromise = useRef<Promise<Membership> | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelected(stored);
  }, []);

  const list = memberships.data ?? [];

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["memberships", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] }),
    ]);
  }, [queryClient, user?.id]);

  const ensureWorkspace = useCallback(async () => {
    if (!user) throw new Error("Sua sessão expirou.");
    const existing = (memberships.data ?? []).find(
      (item) => item.user_id === user.id && item.is_active && Boolean(item.organizations),
    );
    if (existing) return existing;
    if (bootstrapPromise.current) return bootstrapPromise.current;

    setBootstrapping(true);
    setBootstrapError(null);
    bootstrapPromise.current = (async () => {
      try {
        const { data, error } = await supabase.rpc("bootstrap_organization");
        if (error) throw error;
        const result = data?.[0];
        if (!result?.organization_id || !result.membership_id || !result.is_active) {
          throw new Error("O bootstrap não retornou um vínculo ativo.");
        }
        await refreshWorkspace();
        const refreshed = queryClient.getQueryData<Membership[]>(["memberships", user.id]) ?? [];
        const confirmed = refreshed.find(
          (item) => item.id === result.membership_id && item.user_id === user.id && item.is_active,
        );
        if (!confirmed?.organizations) throw new Error("O vínculo criado não pôde ser carregado.");
        return confirmed;
      } catch (error) {
        logTechnical("bootstrap_organization", error);
        setBootstrapError("Seu vínculo com a empresa ainda não foi concluído.");
        throw error;
      } finally {
        setBootstrapping(false);
        bootstrapPromise.current = null;
      }
    })();
    return bootstrapPromise.current;
  }, [memberships.data, queryClient, refreshWorkspace, user]);

  // Primeiro acesso ou registro parcial: executa uma única reparação e aguarda o refetch.
  useEffect(() => {
    if (!user || memberships.isLoading || memberships.isFetching || !memberships.isSuccess || list.length > 0) return;
    void ensureWorkspace().catch(() => undefined);
  }, [ensureWorkspace, list.length, memberships.isFetching, memberships.isLoading, memberships.isSuccess, user]);

  const membership = list.find((m) => m.organization_id === selected) ?? list[0] ?? null;
  const permissions = useRolePermissions(membership?.role);

  const value = useMemo<WorkspaceContextValue>(() => {
    const granted = new Set(permissions.data ?? []);
    const loading = memberships.isLoading || memberships.isFetching || profile.isLoading || bootstrapping;
    const ready = Boolean(user && profile.data && membership?.organizations && membership.is_active && membership.user_id === user.id);
    const status = bootstrapError ? "error" : bootstrapping ? "bootstrapping" : loading ? "loading" : ready ? "ready" : "error";
    return {
      status,
      loading,
      bootstrapping,
      ready,
      user,
      displayName: profile.data?.full_name || user?.email || "Usuário",
      memberships: list,
      membership,
      organizationId: membership?.organization_id ?? null,
      role: membership?.role ?? null,
      onboardingCompleted: Boolean(membership?.organizations?.onboarding_completed_at),
      onboardingStep: membership?.organizations?.onboarding_step ?? 0,
      bootstrapError,
      can: (permission) => granted.has(permission),
      switchWorkspace: (organizationId) => {
        window.localStorage.setItem(STORAGE_KEY, organizationId);
        setSelected(organizationId);
      },
      ensureWorkspace,
      refreshWorkspace,
    };
  }, [
    permissions.data,
    memberships.isLoading,
    memberships.isFetching,
    profile.isLoading,
    profile.data,
    user,
    list,
    membership,
    bootstrapping,
    bootstrapError,
    ensureWorkspace,
    refreshWorkspace,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace deve ser usado dentro de WorkspaceProvider");
  return ctx;
}
