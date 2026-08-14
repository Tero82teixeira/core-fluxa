import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRolePermissions, type Membership } from "@/hooks/use-session";
import type { AppRole, PermissionKey } from "@/lib/domain";
import { resolveSessionMembership } from "@/lib/access-control";

export const WORKSPACE_STORAGE_KEY = "fluxa-workspace";
const INVITATION_STORAGE_KEY = "fluxa-pending-invitation";
const WORKSPACE_TIMEOUT_MS = 12_000;

const MEMBERSHIP_SELECT =
  "id, organization_id, user_id, role, is_active, organizations(id, legal_name, trade_name, document, phone, whatsapp, onboarding_completed, onboarding_completed_at, onboarding_step, organization_settings(zip_code, street, number, district, city, state, main_services, clients_range, employees_range))";

export type WorkspaceStatus = "idle" | "loading" | "bootstrapping" | "ready" | "error";

type Profile = { id: string; full_name: string | null; email: string | null; avatar_url: string | null } | null;

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
  refreshWorkspace: () => Promise<void>;
  retryWorkspace: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WORKSPACE_TIMEOUT")), ms);
    Promise.resolve(promise).then(
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

/** Mensagem específica — nunca genérica — para cada falha real do acesso. */
function describeWorkspaceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
  const code = (error as { code?: string })?.code ?? "";

  if (message.includes("WORKSPACE_TIMEOUT"))
    return "A configuração do seu acesso demorou mais que o esperado. Tente novamente.";
  if (message.includes("BOOTSTRAP_NO_SESSION") || code === "28000")
    return "Sua sessão expirou. Entre novamente para continuar.";
  if (message.includes("BOOTSTRAP_PROFILE_NOT_FOUND"))
    return "Seu perfil não pôde ser carregado (BOOTSTRAP_PROFILE_NOT_FOUND).";
  if (message.includes("BOOTSTRAP_ORGANIZATION_NOT_FOUND"))
    return "A empresa vinculada à sua conta não foi encontrada (BOOTSTRAP_ORGANIZATION_NOT_FOUND).";
  if (message.includes("BOOTSTRAP_MEMBERSHIP_NOT_FOUND"))
    return "Seu vínculo com a empresa não foi encontrado (BOOTSTRAP_MEMBERSHIP_NOT_FOUND).";
  if (message.includes("BOOTSTRAP_MEMBERSHIP_INACTIVE"))
    return "Seu vínculo com a empresa está inativo. Peça a reativação a um administrador.";
  if (code === "42501" || message.toLowerCase().includes("row-level security"))
    return "Seu usuário não tem permissão para ler os dados da empresa.";
  if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network"))
    return "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
  return message ? `Não foi possível configurar seu acesso: ${message}` : "Não foi possível configurar seu acesso.";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [list, setList] = useState<Membership[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // Trava central: uma única sequência de bootstrap/carregamento por vez.
  const inflight = useRef<Promise<void> | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (stored) setSelected(stored);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const fetchWorkspace = useCallback(async (currentUserId: string) => {
    const [profileResult, membershipsResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, avatar_url").eq("id", currentUserId).maybeSingle(),
      supabase
        .from("organization_members")
        .select(MEMBERSHIP_SELECT)
        .eq("user_id", currentUserId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (membershipsResult.error) throw membershipsResult.error;

    const nextProfile = profileResult.data as Profile;
    const nextList = (membershipsResult.data ?? []) as unknown as Membership[];
    if (!nextProfile) throw new Error("BOOTSTRAP_PROFILE_NOT_FOUND");

    const active = nextList.find((item) => item.user_id === currentUserId && item.is_active);
    if (!active) throw new Error("BOOTSTRAP_MEMBERSHIP_NOT_FOUND");
    if (!active.organizations) throw new Error("BOOTSTRAP_ORGANIZATION_NOT_FOUND");

    return { profile: nextProfile, list: nextList };
  }, []);

  /** Carregamento completo: bootstrap (uma vez) + consultas + validação. */
  const load = useCallback(
    (options: { bootstrap: boolean }) => {
      if (!userId) {
        setStatus("idle");
        return Promise.resolve();
      }
      if (inflight.current) return inflight.current;

      const id = ++runId.current;
      setError(null);
      setStatus(options.bootstrap ? "bootstrapping" : "loading");

      const run = (async () => {
        try {
          if (options.bootstrap && window.localStorage.getItem(INVITATION_STORAGE_KEY) !== "1") {
            console.info("[Workspace] bootstrap iniciado");
            const { data, error: rpcError } = await withTimeout(
              supabase.rpc("bootstrap_organization"),
              WORKSPACE_TIMEOUT_MS,
            );
            if (rpcError) throw rpcError;
            const result = Array.isArray(data) ? data[0] : data;
            if (!result?.profile_id) throw new Error("BOOTSTRAP_PROFILE_NOT_FOUND");
            if (!result.organization_id) throw new Error("BOOTSTRAP_ORGANIZATION_NOT_FOUND");
            if (!result.membership_id) throw new Error("BOOTSTRAP_MEMBERSHIP_NOT_FOUND");
            console.info("[Workspace] bootstrap concluído");
          } else if (options.bootstrap) {
            console.info("[Workspace] bootstrap adiado para aceite de convite");
          }

          if (id !== runId.current) return;
          setStatus("loading");

          const next = await withTimeout(fetchWorkspace(userId), WORKSPACE_TIMEOUT_MS);
          if (id !== runId.current) return;

          setProfile(next.profile);
          setList(next.list);
          setStatus("ready");
          console.info("[Workspace] ready");
        } catch (caught) {
          if (id !== runId.current) return;
          console.error("[Workspace] falha", {
            message: caught instanceof Error ? caught.message : undefined,
            code: (caught as { code?: string })?.code,
            details: (caught as { details?: string })?.details,
            hint: (caught as { hint?: string })?.hint,
            userId,
          });
          setError(describeWorkspaceError(caught));
          setStatus("error");
        } finally {
          inflight.current = null;
        }
      })();

      inflight.current = run;
      return run;
    },
    [fetchWorkspace, userId],
  );

  // Único disparo automático: depende apenas da identidade do usuário.
  useEffect(() => {
    runId.current += 1;
    inflight.current = null;
    if (!userId) {
      setStatus("idle");
      setError(null);
      setProfile(null);
      setList([]);
      return;
    }
    setProfile(null);
    setList([]);
    void load({ bootstrap: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const refreshWorkspace = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await withTimeout(fetchWorkspace(userId), WORKSPACE_TIMEOUT_MS);
      setProfile(next.profile);
      setList(next.list);
      setStatus("ready");
    } catch (caught) {
      console.error("[Workspace] falha ao atualizar", {
        message: caught instanceof Error ? caught.message : undefined,
      });
      setError(describeWorkspaceError(caught));
      setStatus("error");
    }
  }, [fetchWorkspace, userId]);

  const retryWorkspace = useCallback(() => {
    if (inflight.current) return;
    void load({ bootstrap: true });
  }, [load]);

  // list can still contain the previous render's data while React processes an
  // auth event. Never expose it unless the row belongs to the current user.
  const membership = resolveSessionMembership(list, userId, selected);
  const permissions = useRolePermissions(membership?.role);

  const value = useMemo<WorkspaceContextValue>(() => {
    const granted = new Set(permissions.data ?? []);
    const ready = status === "ready" && Boolean(membership?.organizations);

    return {
      status,
      loading: status === "loading" || status === "bootstrapping",
      bootstrapping: status === "bootstrapping",
      ready,
      user,
      displayName: profile?.full_name || user?.email || "Usuário",
      memberships: list,
      membership,
      organizationId: membership?.organization_id ?? null,
      role: membership?.role ?? null,
      onboardingCompleted: Boolean(membership?.organizations?.onboarding_completed_at),
      onboardingStep: membership?.organizations?.onboarding_step ?? 0,
      bootstrapError: status === "error" ? error ?? "Não foi possível configurar seu acesso." : null,
      can: (permission) => granted.has(permission),
      switchWorkspace: (organizationId) => {
        try {
          window.localStorage.setItem(WORKSPACE_STORAGE_KEY, organizationId);
        } catch {
          /* armazenamento indisponível */
        }
        setSelected(organizationId);
      },
      refreshWorkspace,
      retryWorkspace,
    };
  }, [permissions.data, status, error, user, profile, list, membership, refreshWorkspace, retryWorkspace]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace deve ser usado dentro de WorkspaceProvider");
  return ctx;
}
