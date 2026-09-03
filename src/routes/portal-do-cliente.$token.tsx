import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, CheckCircle2, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { describeClientPortalError } from "@/lib/client-portal";
import { buildLegalAcceptanceMetadata } from "@/lib/legal";

export const Route = createFileRoute("/portal-do-cliente/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Convite para o Portal do Cliente — FLUXA" },
      {
        name: "description",
        content: "Crie sua conta e aceite o convite seguro para o Portal do Cliente.",
      },
    ],
  }),
  component: ClientPortalInvitationPage,
});

type Preview = {
  organization_name: string;
  client_name: string;
  email: string;
  status: string;
  expires_at: string;
};

type Accepted = {
  organization_name: string;
  client_name: string;
};

function ClientPortalInvitationPage() {
  const { token } = Route.useParams();
  const { status: authStatus, user, signIn, signOut, signingOut } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginMode, setLoginMode] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [accepted, setAccepted] = useState<Accepted | null>(null);

  useEffect(() => {
    let active = true;
    supabase.rpc("client_portal_invitation_preview", { _token: token }).then(({ data, error }) => {
      if (!active) return;
      if (error) toast.error(describeClientPortalError(error));
      setPreview(data?.[0] ?? null);
      setLoadingPreview(false);
    });
    return () => {
      active = false;
    };
  }, [token]);

  async function authenticate() {
    if (!preview) throw new Error("PORTAL_INVITE_NOT_FOUND");
    if (loginMode) {
      await signIn(preview.email, password);
      return true;
    }
    if (!name.trim()) throw new Error("Informe seu nome completo.");
    if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirm) throw new Error("As senhas não são iguais.");
    if (!legalAccepted) throw new Error("Aceite os Termos de Uso e a Política de Privacidade.");

    const { data, error } = await supabase.auth.signUp({
      email: preview.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/portal-do-cliente/${encodeURIComponent(token)}`,
        data: {
          full_name: name.trim(),
          ...buildLegalAcceptanceMetadata("invitation"),
        },
      },
    });
    if (error) throw error;
    if (!data.session) {
      toast.info("Confirme seu e-mail e depois volte a este convite.");
      return false;
    }
    return true;
  }

  async function accept() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      if (!user) {
        const authenticated = await authenticate();
        if (!authenticated) return;
      }
      const { data, error } = await supabase.rpc("accept_client_portal_invitation", {
        _token: token,
      });
      if (error) throw error;
      const result = data?.[0];
      if (!result?.organization_name || !result.client_name)
        throw new Error("PORTAL_INVITE_EMPTY_RESULT");
      setAccepted({
        organization_name: result.organization_name,
        client_name: result.client_name,
      });
      setPassword("");
      setConfirm("");
      toast.success("Convite aceito com sucesso.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      const validation = ["Informe", "A senha", "As senhas", "Aceite"];
      toast.error(
        validation.some((start) => raw.startsWith(start)) ? raw : describeClientPortalError(error),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadingPreview || authStatus === "initializing") {
    return (
      <div className="grid min-h-dvh place-items-center bg-muted/30">
        <Loader2 className="size-6 animate-spin text-primary" aria-label="Carregando convite" />
      </div>
    );
  }

  if (accepted) {
    return (
      <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-5 p-7 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
            <div>
              <h1 className="page-title">Acesso ativado</h1>
              <p className="page-subtitle mt-2">
                Sua conta foi vinculada a {accepted.client_name}, na empresa{" "}
                {accepted.organization_name}.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              O portal ainda está na primeira etapa. Nenhum processo, documento, tarefa ou dado
              interno da empresa foi liberado nesta tela.
            </div>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              <Button asChild>
                <Link to="/meu-portal">Acessar Meu Portal</Link>
              </Button>
              <Button variant="outline" disabled={signingOut} onClick={() => void signOut()}>
                Sair com segurança
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  const invalid =
    !preview ||
    preview.status !== "pending" ||
    new Date(preview.expires_at).getTime() <= Date.now();
  const invalidMessage =
    preview?.status === "cancelled"
      ? "Este convite foi cancelado."
      : preview?.status === "accepted"
        ? "Este convite já foi utilizado."
        : preview?.status === "expired" ||
            (preview && new Date(preview.expires_at).getTime() <= Date.now())
          ? "Este convite expirou."
          : "Este convite não foi encontrado.";

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-5 p-7">
          <div className="flex items-center gap-2 text-primary">
            <Building2 className="size-6" aria-hidden />
            <span className="font-display text-lg font-semibold">FLUXA</span>
          </div>

          {invalid ? (
            <>
              <h1 className="page-title">Convite indisponível</h1>
              <p className="text-sm text-muted-foreground">{invalidMessage}</p>
              <Button asChild variant="outline">
                <Link to="/">Voltar ao início</Link>
              </Button>
            </>
          ) : (
            <>
              <div>
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" aria-hidden />
                </div>
                <h1 className="page-title">Convite para o Portal do Cliente</h1>
                <p className="page-subtitle mt-2">
                  {preview.organization_name} convidou {preview.client_name} pelo e-mail{" "}
                  <strong className="font-medium text-foreground">{preview.email}</strong>.
                </p>
              </div>

              {user ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  Conta conectada: <strong>{user.email}</strong>
                </div>
              ) : (
                <>
                  {!loginMode && (
                    <div className="space-y-2">
                      <Label htmlFor="portal-name">Nome completo</Label>
                      <Input
                        id="portal-name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="portal-password">Senha</Label>
                    <Input
                      id="portal-password"
                      type="password"
                      autoComplete={loginMode ? "current-password" : "new-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                  {!loginMode && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="portal-confirm">Confirmar senha</Label>
                        <Input
                          id="portal-confirm"
                          type="password"
                          autoComplete="new-password"
                          value={confirm}
                          onChange={(event) => setConfirm(event.target.value)}
                        />
                      </div>
                      <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-muted-foreground">
                        <Checkbox
                          className="mt-0.5"
                          checked={legalAccepted}
                          onCheckedChange={(value) => setLegalAccepted(value === true)}
                        />
                        <span>
                          Li e aceito os{" "}
                          <Link
                            to="/termos-de-uso"
                            target="_blank"
                            className="text-primary underline"
                          >
                            Termos de Uso
                          </Link>{" "}
                          e a{" "}
                          <Link
                            to="/politica-de-privacidade"
                            target="_blank"
                            className="text-primary underline"
                          >
                            Política de Privacidade
                          </Link>
                          .
                        </span>
                      </label>
                    </>
                  )}
                </>
              )}

              <Button className="w-full" disabled={busy} onClick={() => void accept()}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <LockKeyhole className="size-4" aria-hidden />
                )}
                {user
                  ? "Aceitar convite"
                  : loginMode
                    ? "Entrar e aceitar"
                    : "Criar conta e aceitar"}
              </Button>

              {!user && (
                <button
                  type="button"
                  className="w-full text-center text-sm text-primary underline-offset-4 hover:underline"
                  onClick={() => {
                    setLoginMode((current) => !current);
                    setPassword("");
                  }}
                >
                  {loginMode ? "Ainda não tenho conta" : "Já tenho uma conta FLUXA"}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
