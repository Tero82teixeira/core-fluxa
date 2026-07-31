import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useMemberships, useProfile, useRolePermissions, type Membership } from "@/hooks/use-session";
import type { AppRole, PermissionKey } from "@/lib/domain";
import type { User } from "@supabase/supabase-js";

const STORAGE_KEY = "fluxa-workspace";

type WorkspaceContextValue = {
  loading: boolean;
  user: User | null;

  displayName: string;
  memberships: Membership[];
  membership: Membership | null;
  organizationId: string | null;
  role: AppRole | null;
  can: (permission: PermissionKey) => boolean;
  switchWorkspace: (organizationId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const memberships = useMemberships();
  const profile = useProfile(user);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelected(stored);
  }, []);

  const list = DEMO_MODE ? DEMO_MEMBERSHIPS : (memberships.data ?? []);
  const membership = list.find((m) => m.organization_id === selected) ?? list[0] ?? null;
  const permissions = useRolePermissions(membership?.role);

  const value = useMemo<WorkspaceContextValue>(() => {
    const granted = new Set(permissions.data ?? []);
    return {
      loading: DEMO_MODE ? false : memberships.isLoading || profile.isLoading,
      user,
      displayName: DEMO_MODE ? DEMO_USER.name : profile.data?.full_name || user?.email || "Usuário",
      memberships: list,
      membership,
      organizationId: membership?.organization_id ?? null,
      role: membership?.role ?? null,
      can: (permission) => (DEMO_MODE ? true : granted.has(permission)),
      switchWorkspace: (organizationId) => {
        window.localStorage.setItem(STORAGE_KEY, organizationId);
        setSelected(organizationId);
      },
    };
  }, [permissions.data, memberships.isLoading, profile.isLoading, profile.data, user, list, membership]);


  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace deve ser usado dentro de WorkspaceProvider");
  return ctx;
}
