import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2, LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useClientPortalSession } from "@/hooks/use-client-portal-session";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/meu-portal")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/entrar" });
  },
  head: () => ({
    meta: [
      { title: "Meu Portal — FLUXA" },
      {
        name: "description",
        content: "Área segura e exclusiva do cliente FLUXA.",
      },
    ],
  }),
  component: MyClientPortal,
});

function MyClientPortal() {
  const navigate = useNavigate();
  const { status, user, signOut, signingOut } = useAuth();
  const session = useClientPortalSession(status === "authenticated");

  useEffect(() => {
    if (status === "unauthenticated") navigate({ to: "/entrar", replace: true });
  }, [status, navigate]);

  if (status === "initializing" || session.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Preparando seu portal…
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/meu-portal" className="flex items-center gap-2 text-primary">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-display font-semibold leading-none">FLUXA</span>
              <span className="mt-1 block text-xs text-muted-foreground">Meu Portal</span>
            </span>
          </Link>
          <Button variant="outline" size="sm" disabled={signingOut} onClick={() => void signOut()}>
            {signingOut ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogOut className="size-4" aria-hidden />
            )}
            Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <section>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck className="size-4" aria-hidden /> Área exclusiva do cliente
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Bem-vindo ao seu portal
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Conta conectada como {user?.email ?? "cliente"}.
          </p>
        </section>

        {session.isError ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold">Não foi possível carregar seu acesso</h2>
              <p className="text-sm text-muted-foreground">
                Atualize a página. Se o problema continuar, solicite ajuda à empresa responsável.
              </p>
              <Button variant="outline" onClick={() => void session.refetch()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : (session.data?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              <LockKeyhole className="size-8 text-muted-foreground" aria-hidden />
              <h2 className="font-semibold">Acesso ainda não concluído</h2>
              <p className="text-sm text-muted-foreground">
                Abra novamente o link de convite enviado pela empresa para concluir a vinculação.
              </p>
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {session.data?.map((access) => (
              <Card key={access.access_id}>
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <UserRound className="size-5" aria-hidden />
                    </span>
                    <StatusBadge
                      label={access.is_active ? "Acesso ativo" : "Acesso desativado"}
                      tone={access.is_active ? "success" : "danger"}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Cliente
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">{access.client_name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{access.organization_name}</p>
                  </div>
                  {access.is_active ? (
                    <div className="rounded-lg border border-success/25 bg-success/5 p-4 text-sm text-muted-foreground">
                      Seu vínculo está confirmado. Processos, documentos e tarefas ainda não foram
                      liberados nesta etapa.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-muted-foreground">
                      Este acesso foi desativado pela empresa. Entre em contato com o responsável
                      para solicitar a reativação.
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Acesso vinculado em {formatDateTime(access.accepted_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-5 text-xs text-muted-foreground">
          <span>Ambiente protegido FLUXA</span>
          <Link to="/termos-de-uso" className="hover:text-foreground hover:underline">
            Termos de Uso
          </Link>
          <Link to="/politica-de-privacidade" className="hover:text-foreground hover:underline">
            Política de Privacidade
          </Link>
        </footer>
      </div>
    </main>
  );
}
