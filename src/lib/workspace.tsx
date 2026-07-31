import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useMemberships, useProfile, useRolePermissions, type Membership } from "@/hooks/use-session";
import type { AppRole, PermissionKey } from "@/lib/domain";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logTechnical } from "@/lib/errors";

const STORAGE_KEY = "fluxa-workspace";
const BOOTSTRAP_TIMEOUT_MS = 10_000;

export type WorkspaceStatus = "idle" | "loading" | "bootstrapping" | "ready" | "error";

type WorkspaceContextValue = {
  status: WorkspaceStatus;
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
  retryWorkspace: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function WorkspaceProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const memberships = useMemberships(user);
  const profile = useProfile(user);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const bootstrapPromise = useRef<Promise<Membership> | null>(null);
  const bootstrapAttempted = useRef(false);
  const membershipsRef = useRef<Membership[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelected(stored);
  }, []);

  const list = memberships.data ?? [];
  membershipsRef.current = list;

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["memberships", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] }),
    ]);
  }, [queryClient, user?.id]);

  // Trava central: uma única chamada de bootstrap por vez, sempre finalizada.
  const ensureWorkspace = useCallback(async () => {
    if (!user) throw new Error("Sua sessão expirou.");
    const existing = membershipsRef.current.find(
      (item) => item.user_id === user.id && item.is_active && Boolean(item.organizations),
    );
    if (existing) return existing;
    if (bootstrapPromise.current) return bootstrapPromise.current;

    bootstrapAttempted.current = true;
    setBootstrapping(true);
    setBootstrapError(null);
    console.info("[Workspace] bootstrap iniciado", { userId: user.id });

    bootstrapPromise.current = (async () => {
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(supabase.rpc("bootstrap_organization")),
          BOOTSTRAP_TIMEOUT_MS,
          "BOOTSTRAP_TIMEOUT",
        );
        if (error) throw error;
        const result = data?.[0];
        if (!result?.organization_id) throw new Error("BOOTSTRAP_ORGANIZATION_NOT_CREATED");
        if (!result.membership_id || !result.is_active) throw new Error("BOOTSTRAP_MEMBERSHIP_NOT_CREATED");

        await withTimeout(refreshWorkspace(), BOOTSTRAP_TIMEOUT_MS, "BOOTSTRAP_TIMEOUT");
        const refreshed = queryClient.getQueryData<Membership[]>(["memberships", user.id]) ?? [];
        const confirmed = refreshed.find(
          (item) => item.id === result.membership_id && item.user_id === user.id && item.is_active,
        );
        if (!confirmed?.organizations) throw new Error("BOOTSTRAP_MEMBERSHIP_NOT_CREATED");
        console.info("[Workspace] bootstrap concluído");
        return confirmed;
      } catch (error) {
        logTechnical("bootstrap_organization", error);
        console.error("[Workspace] falha", {
          message: error instanceof Error ? error.message : undefined,
          code: typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined,
          details:
            typeof error === "object" && error && "details" in error
              ? (error as { details?: string }).details
              : undefined,
          hint: typeof error === "object" && error && "hint" in error ? (error as { hint?: string }).hint : undefined,
        });
        setBootstrapError("Não foi possível configurar seu acesso.");
        throw error;
      } finally {
        setBootstrapping(false);
        bootstrapPromise.current = null;
      }
    })();
    return bootstrapPromise.current;
  }, [queryClient, refreshWorkspace, user]);

  // Primeiro acesso ou registro parcial: uma única tentativa automática de reparo.
  useEffect(() => {
    if (!user) return;
    if (memberships.isLoading || memberships.isFetching || !memberships.isSuccess) return;
    if (list.length > 0 || bootstrapAttempted.current || bootstrapPromise.current) return;
    void ensureWorkspace().catch(() => undefined);
  }, [ensureWorkspace, list.length, memberships.isFetching, memberships.isLoading, memberships.isSuccess, user]);

  // Consultas bloqueadas por RLS ou rede: encerra em erro em vez de girar para sempre.
  useEffect(() => {
    if (memberships.isError || profile.isError) {
      setBootstrapError("Não foi possível configurar seu acesso.");
    }
  }, [memberships.isError, profile.isError]);

  useEffect(() => {
    if (!user) {
      bootstrapAttempted.current = false;
      setBootstrapError(null);
    }
  }, [user]);

  const retryWorkspace = useCallback(() => {
    bootstrapAttempted.current = false;
    setBootstrapError(null);
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const membership = list.find((m) => m.organization_id === selected) ?? list[0] ?? null;
  const permissions = useRolePermissions(membership?.role);

  // Watchdog: nenhuma tela pode ficar presa em carregamento.
  const settled = Boolean(bootstrapError) || Boolean(membership?.organizations && profile.data);
  useEffect(() => {
    if (!user || settled) return;
    const timer = setTimeout(() => setBootstrapError("Não foi possível configurar seu acesso."), BOOTSTRAP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [settled, user]);

  useEffect(() => {
    if (user) console.info("[Workspace] início", { userId: user.id });
  }, [user]);
  useEffect(() => {
    if (profile.data) console.info("[Workspace] profile carregado");
  }, [profile.data]);
  useEffect(() => {
    if (membership) console.info("[Workspace] membership carregado");
    if (membership?.organizations) console.info("[Workspace] organização carregada");
  }, [membership]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const granted = new Set(permissions.data ?? []);
    const querying = memberships.isLoading || memberships.isFetching || profile.isLoading || profile.isFetching;
    const ready = Boolean(
      user && profile.data && membership?.organizations && membership.is_active && membership.user_id === user.id,
    );

    let status: WorkspaceStatus;
    if (!user) status = "idle";
    else if (ready) status = "ready";
    else if (bootstrapError) status = "error";
    else if (bootstrapping) status = "bootstrapping";
    else if (querying) status = "loading";
    else if (memberships.isSuccess && list.length === 0 && !bootstrapAttempted.current) status = "bootstrapping";
    else status = "error";

    return {
      status,
      loading: status === "loading" || status === "bootstrapping",
      bootstrapping: status === "bootstrapping",
      ready,
      user,
      displayName: profile.data?.full_name || user?.email || "Usuário",
      memberships: list,
      membership,
      organizationId: membership?.organization_id ?? null,
      role: membership?.role ?? null,
      onboardingCompleted: Boolean(membership?.organizations?.onboarding_completed_at),
      onboardingStep: membership?.organizations?.onboarding_step ?? 0,
      bootstrapError: status === "error" ? bootstrapError ?? "Não foi possível configurar seu acesso." : null,
      can: (permission) => granted.has(permission),
      switchWorkspace: (organizationId) => {
        window.localStorage.setItem(STORAGE_KEY, organizationId);
        setSelected(organizationId);
      },
      ensureWorkspace,
      refreshWorkspace,
      retryWorkspace,
    };
  }, [
    permissions.data,
    memberships.isLoading,
    memberships.isFetching,
    memberships.isSuccess,
    profile.isLoading,
    profile.isFetching,
    profile.data,
    user,
    list,
    membership,
    bootstrapping,
    bootstrapError,
    ensureWorkspace,
    refreshWorkspace,
    retryWorkspace,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace deve ser usado dentro de WorkspaceProvider");
  return ctx;
}
