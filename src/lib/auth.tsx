import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Fonte única de verdade da autenticação.
 *
 * Responsabilidades: carregar a sessão, observar mudanças, expor login,
 * cadastro e logout. Nunca cria perfil, empresa ou vínculo — isso pertence
 * exclusivamente ao WorkspaceProvider (via RPC segura).
 */
export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

type SignUpResult = { needsEmailConfirmation: boolean };

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: { email: string; password: string; fullName: string }) => Promise<SignUpResult>;
  resendConfirmation: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  signingOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [signingOut, setSigningOut] = useState(false);
  const mounted = useRef(true);
  const appliedUserId = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;

    const apply = (next: Session | null) => {
      if (!mounted.current) return;
      const nextUserId = next?.user.id ?? null;
      if (appliedUserId.current !== nextUserId) {
        // Organization-scoped query results must never cross an identity boundary.
        queryClient.clear();
        appliedUserId.current = nextUserId;
      }
      setSession(next);
      setStatus(next?.user ? "authenticated" : "unauthenticated");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => apply(next));
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async ({ email, password, fullName }: { email: string; password: string; fullName: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/central`, data: { full_name: fullName } },
    });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/central` },
    });
    if (error) throw error;
  }, []);

  /**
   * Logout à prova de falhas: mesmo que a chamada remota falhe, a sessão local
   * é descartada e o usuário volta ao login. Não depende do WorkspaceProvider.
   */
  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.error("[Auth] falha ao encerrar sessão", {
        message: error instanceof Error ? error.message : undefined,
      });
    } finally {
      queryClient.clear();
      appliedUserId.current = null;
      try {
        window.localStorage.removeItem("fluxa-workspace");
      } catch {
        /* armazenamento indisponível: segue para o redirecionamento */
      }
      setSigningOut(false);
      window.location.replace("/entrar");
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      signIn,
      signUp,
      resendConfirmation,
      signOut,
      signingOut,
    }),
    [status, session, signIn, signUp, resendConfirmation, signOut, signingOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
