import { useEffect } from "react";
import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { DEMO_MODE } from "@/lib/demo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (DEMO_MODE) {
      const { data } = await supabase.auth.getUser();
      return { user: data?.user ?? null };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/entrar" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

/** Leva o usuário sem empresa (ou com onboarding pendente) para a configuração. */
function OnboardingGate() {
  const { loading, ready, onboardingCompleted } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const onOnboarding = location.pathname.startsWith("/onboarding");

  useEffect(() => {
    if (DEMO_MODE || loading || !ready) return;
    if (!onboardingCompleted && !onOnboarding) navigate({ to: "/onboarding", replace: true });
    if (onboardingCompleted && onOnboarding) navigate({ to: "/central", replace: true });
  }, [loading, ready, onboardingCompleted, onOnboarding, navigate]);

  return null;
}

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    await supabase.auth.signOut();
    queryClient.clear();
    window.localStorage.removeItem("fluxa-workspace");
    navigate({ to: "/entrar", replace: true });
  };

  // Sessão expirada ou encerrada em outra aba: volta para o login.
  useEffect(() => {
    if (DEMO_MODE) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        window.localStorage.removeItem("fluxa-workspace");
        navigate({ to: "/entrar", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, queryClient]);

  return (
    <WorkspaceProvider user={user}>
      <OnboardingGate />
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar onSignOut={handleSignOut} />
          <SidebarInset className="min-w-0">
            <AppHeader onSignOut={handleSignOut} />
            <main className="min-w-0 flex-1">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </WorkspaceProvider>
  );
}
