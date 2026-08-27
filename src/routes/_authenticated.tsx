import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { CommercialAccessBlocked } from "@/components/commercial/commercial-access";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/entrar" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

/** Leva o usuário sem empresa (ou com onboarding pendente) para a configuração. */
function OnboardingGate() {
  const { status, onboardingCompleted } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const onOnboarding = location.pathname.startsWith("/onboarding");

  useEffect(() => {
    if (status !== "ready") return;
    if (!onboardingCompleted && !onOnboarding) navigate({ to: "/onboarding", replace: true });
    if (onboardingCompleted && onOnboarding) navigate({ to: "/central", replace: true });
  }, [status, onboardingCompleted, onOnboarding, navigate]);

  return null;
}

/** Recuperação determinística quando o acesso não pôde ser configurado. */
function WorkspaceRecovery() {
  const { bootstrapError, retryWorkspace, status } = useWorkspace();
  const { signOut, signingOut } = useAuth();
  const retrying = status === "loading" || status === "bootstrapping";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">Não foi possível configurar seu acesso.</h1>
        <p className="text-sm text-muted-foreground">{bootstrapError}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={retryWorkspace}
          disabled={retrying}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
        >
          {retrying && <Loader2 className="h-4 w-4 animate-spin" />}
          Tentar novamente
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-70"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function WorkspaceContent() {
  const { status } = useWorkspace();
  if (status === "error") return <WorkspaceRecovery />;
  return <Outlet />;
}

function AuthenticatedLayout() {
  const { status: authStatus, signOut, signingOut } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = () => void signOut();

  // Sessão encerrada em outra aba ou expirada: volta para o login.
  useEffect(() => {
    if (authStatus === "unauthenticated") navigate({ to: "/entrar", replace: true });
  }, [authStatus, navigate]);

  if (authStatus !== "authenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando sua sessão…
      </div>
    );
  }

  return (
    <WorkspaceProvider>
      <OnboardingGate />
      <CommercialWorkspace onSignOut={handleSignOut} signingOut={signingOut} />
    </WorkspaceProvider>
  );
}

function CommercialWorkspace({
  onSignOut,
  signingOut,
}: {
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const { status, onboardingCompleted, commercialAccess } = useWorkspace();
  if (status === "ready" && onboardingCompleted && !commercialAccess.allowed) {
    return (
      <CommercialAccessBlocked
        access={commercialAccess}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />
    );
  }
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar onSignOut={onSignOut} />
        <SidebarInset className="min-w-0">
          <AppHeader onSignOut={onSignOut} />
          <main className="min-w-0 flex-1">
            <WorkspaceContent />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
