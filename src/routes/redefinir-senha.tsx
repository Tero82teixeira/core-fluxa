import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { describeAuthError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — FLUXA" },
      { name: "description", content: "Defina uma nova senha para acessar sua central de operações." },
      { property: "og:title", content: "Redefinir senha — FLUXA" },
      { property: "og:description", content: "Defina uma nova senha para acessar sua central de operações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // O link de recuperação cria uma sessão temporária no retorno do e-mail.
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirm("");
      toast.success("Senha atualizada. Entre com a nova senha.");
      await supabase.auth.signOut();
      navigate({ to: "/entrar", replace: true });
    } catch (caught) {
      const message = describeAuthError(caught);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-md border-border shadow-panel">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-brand">
            <ShieldCheck className="size-5" aria-hidden />
            <span className="font-display text-lg font-semibold">FLUXA</span>
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold">Definir nova senha</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {ready
              ? "Escolha uma senha nova para continuar acessando sua conta."
              : "Abra esta página pelo link enviado ao seu e-mail para redefinir a senha."}
          </p>

          {error && (
            <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {error}
            </p>
          )}

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={show ? "text" : "password"}
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!ready}
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type={show ? "text" : "password"}
                value={confirm}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                disabled={!ready}
                className="h-11"
              />
            </div>

            <Button type="submit" disabled={!ready || saving} aria-busy={saving} className="h-11 w-full">
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {saving ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => navigate({ to: "/entrar" })}
            className="mt-5 w-full text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Voltar para o login
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
