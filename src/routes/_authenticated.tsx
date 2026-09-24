import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { StaffQuickChat } from "@/components/layout/staff-quick-chat";
import { PushNotificationOnboarding } from "@/components/notifications/push-notification-onboarding";
import { CommercialAccessBlocked } from "@/components/commercial-access-blocked";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { requiresWorkspaceSetup } from "@/lib/onboarding-entry";
import {
  healthWorkspaceHome,
  isFocusedHealthWorkspace,
  routeVisibleForModules,
} from "@/lib/organization-segments";

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
  const {
    status,
    onboardingCompleted,
    onboardingExplorationEnabled,
    commercialAccess,
    platformAdmin,
    membership,
  } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const onOnboarding = location.pathname.startsWith("/onboarding");
  const settings = membership?.organizations?.organization_settings;
  const needsOnboarding = requiresWorkspaceSetup(
    onboardingCompleted,
    onboardingExplorationEnabled,
    settings?.business_segment,
  );
  const onPlatformArea =
    location.pathname.startsWith("/administracao-plataforma") ||
    location.pathname.startsWith("/suporte-plataforma");

  useEffect(() => {
    if (status !== "ready") return;
    if (!commercialAccess) return;
    if (platformAdmin && onPlatformArea) return;
    if (needsOnboarding && !onOnboarding) {
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    if (onboardingCompleted && onOnboarding) {
      navigate({
        to: isFocusedHealthWorkspace(settings)
          ? healthWorkspaceHome(settings?.enabled_modules)
          : "/meu-dia",
        replace: true,
      });
      return;
    }

    if (
      !onOnboarding &&
      !onPlatformArea &&
      !routeVisibleForModules(
        location.pathname,
        settings?.business_segment,
        settings?.enabled_modules,
        isFocusedHealthWorkspace(settings),
      )
    ) {
      navigate({
        to: isFocusedHealthWorkspace(settings)
          ? healthWorkspaceHome(settings?.enabled_modules)
          : "/meu-dia",
        replace: true,
      });
    }
  }, [
    status,
    onboardingCompleted,
    needsOnboarding,
    commercialAccess,
    platformAdmin,
    membership,
    location.pathname,
    onOnboarding,
    onPlatformArea,
    navigate,
  ]);

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
        <h1 className="text-lg font-semibold text-foreground">
          Não foi possível configurar seu acesso.
        </h1>
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

function WorkspaceContent({ onSignOut }: { onSignOut: () => void }) {
  const {
    status,
    commercialAccess,
    platformAdmin,
    organizationId,
    onboardingCompleted,
    onboardingExplorationEnabled,
    membership,
  } = useWorkspace();
  const pathname = useLocation({ select: (location) => location.pathname });
  const onPlatformArea =
    pathname.startsWith("/administracao-plataforma") || pathname.startsWith("/suporte-plataforma");
  const settings = membership?.organizations?.organization_settings;
  const onOnboarding = pathname.startsWith("/onboarding");
  const needsOnboarding = requiresWorkspaceSetup(
    onboardingCompleted,
    onboardingExplorationEnabled,
    settings?.business_segment,
  );
  const moduleRouteAllowed =
    status !== "ready" ||
    onPlatformArea ||
    routeVisibleForModules(
      pathname,
      settings?.business_segment,
      settings?.enabled_modules,
      isFocusedHealthWorkspace(settings),
    );

  if (status === "error") return <WorkspaceRecovery />;
  if (status === "ready" && !commercialAccess && !(platformAdmin && onPlatformArea)) {
    return <CommercialAccessBlocked onSignOut={onSignOut} />;
  }

  // Um novo workspace não expõe o menu geral enquanto a área não foi definida.
  if (status === "ready" && needsOnboarding) {
    return onOnboarding ? (
      <main className="min-h-dvh bg-muted/20">
        <Outlet />
      </main>
    ) : (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparando a escolha da sua área…
      </div>
    );
  }

  if (status === "ready" && onboardingCompleted && onOnboarding) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Abrindo seu workspace…
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-sidebar">
        <AppSidebar onSignOut={onSignOut} />
        <SidebarInset className="min-w-0 overflow-hidden border-border/70 shadow-2xl shadow-black/10 md:border">
          <AppHeader onSignOut={onSignOut} />
          <main className="min-w-0 bg-muted/20 flex-1 pb-24 sm:pb-28">
            {moduleRouteAllowed ? (
              <Outlet />
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecionando para uma área disponível…
              </div>
            )}
          </main>
        </SidebarInset>
        {!isFocusedHealthWorkspace(settings) && <StaffQuickChat />}
        <PushNotificationOnboarding
          organizationId={organizationId}
          enabled={status === "ready" && commercialAccess && onboardingCompleted}
        />
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedLayout() {
  const { status: authStatus, signOut } = useAuth();
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
      <WorkspaceContent onSignOut={handleSignOut} />
    </WorkspaceProvider>
  );
}
