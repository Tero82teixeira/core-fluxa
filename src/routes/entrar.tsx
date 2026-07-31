import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  Target,
  CalendarClock,
  Activity,
  FolderKanban,
  AlarmClock,
  ListChecks,
  Users,
  Loader2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { DEMO_MODE } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar — FLUXA" },
      { name: "description", content: "Acesse a central inteligente de processos da sua empresa." },
      { property: "og:title", content: "Entrar — FLUXA" },
      { property: "og:description", content: "Acesse a central inteligente de processos da sua empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const BENEFITS = [
  { icon: Target, label: "Tenha clareza sobre todas as prioridades" },
  { icon: CalendarClock, label: "Nunca perca um prazo importante" },
  { icon: Activity, label: "Acompanhe sua operação em tempo real" },
];

const PREVIEW_CARDS = [
  { icon: FolderKanban, label: "Processos ativos", value: "128" },
  { icon: AlarmClock, label: "Prazos críticos", value: "06" },
  { icon: ListChecks, label: "Tarefas de hoje", value: "23" },
  { icon: Users, label: "Clientes aguardando retorno", value: "09" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * TODO(auth): fluxo temporário de demonstração.
 * Enquanto AUTH_ENABLED === false, o formulário apenas valida os dados localmente
 * e exibe um estado de sucesso — nenhuma chamada de API é feita, nenhum usuário
 * fictício é criado e nenhum redirecionamento para área protegida acontece.
 * Ao conectar o banco de dados e a autenticação (Supabase Auth), basta ativar a
 * constante abaixo para que o fluxo real de signUp/signIn seja executado.
 */
const AUTH_ENABLED = false;

const DEMO_SUCCESS_MESSAGE =
  "Estrutura de cadastro pronta. A criação real da conta será ativada quando o banco de dados e a autenticação forem conectados.";

const SIGNUP_SUCCESS_TITLE = "Cadastro validado com sucesso.";
const SIGNUP_SUCCESS_SUBTITLE =
  "A ativação da conta será concluída quando a autenticação da plataforma for conectada.";

function translateAuthError(message: string, status?: number): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos. Verifique e tente novamente.";
  if (m.includes("email not confirmed") || m.includes("not confirmed"))
    return "Sua conta ainda não foi verificada. Confira o e-mail de confirmação.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Já existe uma conta com este e-mail. Faça login.";
  if (m.includes("rate limit") || m.includes("too many") || status === 429)
    return "Muitas tentativas de acesso. Aguarde alguns instantes antes de tentar novamente.";
  if (m.includes("password") && m.includes("6")) return "A senha deve ter pelo menos 6 caracteres.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("timeout"))
    return "Erro temporário de conexão. Verifique sua internet e tente novamente.";
  return "Não foi possível concluir. Tente novamente em instantes.";
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [validated, setValidated] = useState(false);

  const validate = () => {
    const next: typeof errors = {};
    if (mode === "signup" && !name.trim()) next.name = "Informe seu nome completo.";
    if (!email.trim()) next.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(email.trim())) next.email = "Digite um e-mail válido, como nome@empresa.com.br.";
    if (!password) next.password = "Informe sua senha.";
    else if (password.length < 6) next.password = "A senha deve ter pelo menos 6 caracteres.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setDemoSuccess(false);
    if (!validate()) {
      setValidated(false);
      return;
    }

    if (!AUTH_ENABLED) {
      setErrors({});
      if (mode === "signup") {
        setValidated(true);
      } else {
        setDemoSuccess(true);
        toast.success(DEMO_SUCCESS_MESSAGE);
      }
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() } },
        });
        if (error) throw error;
      }
      navigate({ to: "/central" });
    } catch (error) {
      const message =
        error instanceof Error
          ? translateAuthError(error.message, (error as { status?: number }).status)
          : "Erro temporário de conexão. Tente novamente.";
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setErrors((e) => ({ ...e, email: "Informe seu e-mail para receber o link de redefinição." }));
      return;
    }
    if (!AUTH_ENABLED) {
      toast.success(DEMO_SUCCESS_MESSAGE);
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success("Enviamos um link de redefinição para o seu e-mail.");
    } catch (error) {
      toast.error(error instanceof Error ? translateAuthError(error.message) : "Não foi possível enviar o link.");
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Área institucional */}
      <section className="relative overflow-hidden bg-primary px-6 py-10 text-primary-foreground sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/12 ring-1 ring-primary-foreground/25">
            <Activity className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight">FLUXA</span>
        </div>

        <div className="relative mt-8 lg:mt-0">
          <h1 className="font-display text-3xl font-semibold text-balance-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            Sua operação inteira em um único fluxo.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-primary-foreground/80">
            Organize clientes, documentos, prazos e equipe com mais velocidade, clareza e menos trabalho manual.
          </p>

          <ul className="mt-7 space-y-3">
            {BENEFITS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm sm:text-base">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="text-primary-foreground/90">{label}</span>
              </li>
            ))}
          </ul>

          {/* Prévia visual abstrata do produto */}
          <div className="mt-8 hidden grid-cols-2 gap-3 sm:grid lg:mt-10 lg:max-w-xl">
            {PREVIEW_CARDS.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/[0.07] p-4 backdrop-blur-[2px] transition-colors duration-300 hover:bg-primary-foreground/[0.11]"
              >
                <div className="flex items-center gap-2 text-primary-foreground/70">
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  <span className="truncate text-xs font-medium">{label}</span>
                </div>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary-foreground/15">
                  <div className="h-full w-2/3 rounded-full bg-primary-foreground/45" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-8 flex items-center gap-2.5 text-sm text-primary-foreground/75 lg:mt-0">
          <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>Seus dados protegidos em um ambiente exclusivo para sua empresa.</span>
        </div>
      </section>

      {/* Área de autenticação */}
      <section className="flex items-center justify-center bg-background px-4 py-10 sm:px-6">
        <Card className="w-full max-w-md border-border shadow-panel">
          <CardContent className="p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold">
              {mode === "login" ? "Bem-vindo à FLUXA" : "Criar empresa na FLUXA"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "login"
                ? "Entre para acessar sua central de operações."
                : "Crie sua conta e comece a organizar sua operação."}
            </p>

            {errors.form && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                {errors.form}
              </div>
            )}

            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setValidated(false);
                      setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    maxLength={120}
                    autoComplete="name"
                    aria-invalid={Boolean(errors.name)}
                    className="h-11 transition-shadow duration-200 focus-visible:ring-2"
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setValidated(false);
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  maxLength={255}
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  className="h-11 transition-shadow duration-200 focus-visible:ring-2"
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setValidated(false);
                      setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    aria-invalid={Boolean(errors.password)}
                    className="h-11 pr-11 transition-shadow duration-200 focus-visible:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>

              {validated && mode === "signup" && (
                <div
                  role="status"
                  className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-foreground"
                >
                  <p className="font-medium">{SIGNUP_SUCCESS_TITLE}</p>
                  <p className="mt-0.5 text-muted-foreground">{SIGNUP_SUCCESS_SUBTITLE}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                  Lembrar meu acesso
                </label>
                <button
                  type="button"
                  onClick={forgotPassword}
                  className="text-sm font-medium text-brand transition-colors hover:text-primary"
                >
                  Esqueci minha senha
                </button>
              </div>

              <Button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="h-11 w-full bg-brand text-brand-foreground text-base font-semibold transition-transform duration-200 hover:bg-brand/90 active:scale-[0.99] disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === "login" ? "Entrando…" : "Criando conta…"}
                  </>
                ) : mode === "login" ? (
                  "Entrar"
                ) : (
                  "Criar conta e empresa"
                )}
              </Button>
            </form>

            {DEMO_MODE && (
              <button
                type="button"
                onClick={() => {
                  setPassword("");
                  navigate({ to: "/central" });
                }}
                className="mt-4 w-full text-sm font-medium text-brand transition-colors hover:text-primary"
              >
                Entrar diretamente na demonstração
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setErrors({});
                setDemoSuccess(false);
                setValidated(false);
              }}
              className="mt-5 w-full text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {mode === "login" ? (
                <>
                  Ainda não possui uma conta? <span className="font-medium text-brand">Criar empresa</span>
                </>
              ) : (
                "Já tenho conta"
              )}
            </button>

            {DEMO_MODE && import.meta.env.DEV && (
              <p className="mt-6 text-center text-xs text-muted-foreground/70">Modo de demonstração</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
