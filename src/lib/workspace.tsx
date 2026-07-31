import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useMemberships, useProfile, useRolePermissions, type Membership } from "@/hooks/use-session";
import type { AppRole, PermissionKey } from "@/lib/domain";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logTechnical } from "@/lib/errors";

const STORAGE_KEY = "fluxa-workspace";

type WorkspaceContextValue = {
  loading: boolean;
  user: User | null;

  displayName: string;
  memberships: Membership[];
  membership: Membership | null;
  organizationId: string | null;
  role: AppRole | null;
  onboardingCompleted: boolean;
  bootstrapError: string | null;
  can: (permission: PermissionKey) => boolean;
  switchWorkspace: (organizationId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const memberships = useMemberships();
  const profile = useProfile(user);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelected(stored);
  }, []);

  const list = memberships.data ?? [];

  // Primeiro acesso: garante profile + empresa + vínculo de proprietário (idempotente).
  useEffect(() => {
    if (!user || attempted.current) return;
    if (memberships.isLoading || memberships.isFetching) return;
    if (!memberships.isSuccess || list.length > 0) return;

    attempted.current = true;
    setBootstrapping(true);
    supabase
      .rpc("bootstrap_organization")
      .then(async ({ error }) => {
        if (error) throw error;
        setBootstrapError(null);
        await queryClient.invalidateQueries({ queryKey: ["memberships"] });
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
      })
      .catch((error) => {
        logTechnical("bootstrap_organization", error);
        setBootstrapError("Seu vínculo com a empresa ainda não foi concluído.");
      })
      .finally(() => setBootstrapping(false));
  }, [user, memberships.isLoading, memberships.isFetching, memberships.isSuccess, list.length, queryClient]);

  const membership = list.find((m) => m.organization_id === selected) ?? list[0] ?? null;
  const permissions = useRolePermissions(membership?.role);

  const value = useMemo<WorkspaceContextValue>(() => {
    const granted = new Set(permissions.data ?? []);
    return {
      loading: memberships.isLoading || profile.isLoading || bootstrapping,
      user,
      displayName: profile.data?.full_name || user?.email || "Usuário",
      memberships: list,
      membership,
      organizationId: membership?.organization_id ?? null,
      role: membership?.role ?? null,
      onboardingCompleted: Boolean(membership?.organizations?.onboarding_completed_at),
      bootstrapError,
      can: (permission) => granted.has(permission),
      switchWorkspace: (organizationId) => {
        window.localStorage.setItem(STORAGE_KEY, organizationId);
        setSelected(organizationId);
      },
    };
  }, [
    permissions.data,
    memberships.isLoading,
    profile.isLoading,
    profile.data,
    user,
    list,
    membership,
    bootstrapping,
    bootstrapError,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace deve ser usado dentro de WorkspaceProvider");
  return ctx;
}
