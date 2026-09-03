import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  MailCheck,
  Building2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { describeAuthError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

type AuthMode = "login" | "signup";
type AuthSearch = { mode?: AuthMode };

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    mode: search.mode === "signup" ? "signup" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — FLUXA" },
      { name: "description", content: "Acesse a central inteligente de processos da sua empresa." },
      { property: "og:title", content: "Entrar — FLUXA" },
      {
        property: "og:description",
        content: "Acesse a central inteligente de processos da sua empresa.",
      },
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

/** Apenas o e-mail é lembrado — a senha nunca sai do formulário. */
const REMEMBER_KEY = "fluxa-remember-email";

const SIGNUP_SUCCESS_TITLE = "Conta criada com sucesso.";
const SIGNUP_SUCCESS_SUBTITLE = "Estamos levando você para a configuração da empresa.";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { status: authStatus, signIn, signUp, resendConfirmation } = useAuth();
  const [mode, setMode] = useState<AuthMode>(search.mode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    legal?: string;
    form?: string;
  }>({});
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [validated, setValidated] = useState(false);
  const routingAuthenticatedUser = useRef(false);

  // Contas internas seguem para o workspace; clientes ficam no portal isolado.
  useEffect(() => {
    if (authStatus !== "authenticated" || routingAuthenticatedUser.current) return;
    routingAuthenticatedUser.current = true;
    setLoading(true);
    supabase.rpc("resolve_authenticated_home").then(({ data, error }) => {
      if (error) {
        console.error("[Auth] falha ao resolver destino autenticado", {
          message: error.message,
          code: error.code,
        });
        routingAuthenticatedUser.current = false;
        setLoading(false);
        setErrors({ form: "Não foi possível identificar sua área de acesso. Tente novamente." });
        return;
      }
      navigate({ to: data === "client_portal" ? "/meu-portal" : "/central", replace: true });
    });
  }, [authStatus, navigate]);

  useEffect(() => {
    setMode(search.mode ?? "login");
  }, [search.mode]);

  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(REMEMBER_KEY);
      if (remembered) setEmail(remembered);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const validate = () => {
    const next: typeof errors = {};
    if (mode === "signup" && !name.trim()) next.name = "Informe seu nome completo.";
    if (!email.trim()) next.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(email.trim()))
      next.email = "Digite um e-mail válido, como nome@empresa.com.br.";
    if (!password) next.password = "Informe sua senha.";
    else if (password.length < 6) next.password = "A senha deve ter pelo menos 6 caracteres.";
    if (mode === "signup" && !legalAccepted)
      next.legal = "Você precisa aceitar os Termos e declarar ciência da Política de Privacidade.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setNeedsConfirmation(false);
    if (!validate()) {
      setValidated(false);
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
        try {
          window.localStorage.setItem(REMEMBER_KEY, remember ? email.trim() : "");
        } catch {
          /* armazenamento indisponível */
        }
        setPassword("");
        // O efeito acima consulta o destino seguro antes de navegar.
      } else {
        const { needsEmailConfirmation } = await signUp({
          email: email.trim(),
          password,
          fullName: name.trim(),
        });
        setPassword("");

        if (needsEmailConfirmation) {
          setNeedsConfirmation(true);
          toast.success("Confirme o e-mail enviado para ativar sua conta.");
        } else {
          setValidated(true);
          toast.success("Conta criada. Vamos configurar sua empresa.");
        }
      }
    } catch (error) {
      console.error("[Auth] falha no formulário", {
        mode,
        message: error instanceof Error ? error.message : undefined,
        code: (error as { code?: string })?.code,
      });
      const message = describeAuthError(error);
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await resendConfirmation(email.trim());
      toast.success("Reenviamos o e-mail de confirmação.");
    } catch (error) {
      toast.error(describeAuthError(error));
    }
  };

  const forgotPassword = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setErrors((e) => ({ ...e, email: "Informe seu e-mail para receber o link de redefinição." }));
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      toast.success("Enviamos um link de redefinição para o seu e-mail.");
    } catch (error) {
      toast.error(describeAuthError(error));
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

        <Link
          to="/"
          className="relative flex w-fit items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:outline-none"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/12 ring-1 ring-primary-foreground/25">
            <Activity className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight">FLUXA</span>
        </Link>

        <div className="relative mt-8 lg:mt-0">
          <h1 className="font-display text-3xl font-semibold text-balance-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            Sua operação inteira em um único fluxo.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-primary-foreground/80">
            Organize clientes, documentos, prazos e equipe com mais velocidade, clareza e menos
            trabalho manual.
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
                : "Crie sua conta e experimente todos os recursos por 14 dias."}
            </p>

            {errors.form && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                {errors.form}
              </div>
            )}

            {mode === "signup" && !needsConfirmation && (
              <div className="mt-5 flex gap-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-3 text-sm">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="font-medium text-foreground">
                    Este cadastro cria uma nova empresa.
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Se você foi convidado para uma equipe, use o link enviado pelo administrador.
                  </p>
                </div>
              </div>
            )}

            {needsConfirmation ? (
              <div role="status" className="mt-6 space-y-5 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/10 text-success">
                  <MailCheck className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-xl font-semibold text-foreground">
                    Confirme seu e-mail
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Enviamos um link para{" "}
                    <strong className="font-medium text-foreground">{email.trim()}</strong>. A
                    empresa e os 14 dias de teste serão liberados somente depois da confirmação.
                  </p>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={resend}>
                  Reenviar e-mail de confirmação
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsConfirmation(false);
                    setMode("login");
                  }}
                  className="text-sm font-medium text-brand transition-colors hover:text-primary"
                >
                  Voltar para o login
                </button>
              </div>
            ) : (
              <>
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
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-sm text-destructive">{errors.password}</p>
                    )}
                  </div>

                  {mode === "signup" && (
                    <div className="space-y-2 pt-1">
                      <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-muted-foreground">
                        <Checkbox
                          id="legal-acceptance"
                          className="mt-0.5"
                          checked={legalAccepted}
                          onCheckedChange={(value) => {
                            setLegalAccepted(value === true);
                            setErrors((previous) => ({ ...previous, legal: undefined }));
                          }}
                          aria-invalid={Boolean(errors.legal)}
                        />
                        <span>
                          Li e aceito os{" "}
                          <Link
                            to="/termos-de-uso"
                            target="_blank"
                            className="font-medium text-primary underline underline-offset-2"
                          >
                            Termos de Uso
                          </Link>{" "}
                          e declaro ciência da{" "}
                          <Link
                            to="/politica-de-privacidade"
                            target="_blank"
                            className="font-medium text-primary underline underline-offset-2"
                          >
                            Política de Privacidade
                          </Link>
                          .
                        </span>
                      </label>
                      {errors.legal && <p className="text-sm text-destructive">{errors.legal}</p>}
                    </div>
                  )}

                  {validated && mode === "signup" && (
                    <div
                      role="status"
                      className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-foreground"
                    >
                      <p className="font-medium">{SIGNUP_SUCCESS_TITLE}</p>
                      <p className="mt-0.5 text-muted-foreground">{SIGNUP_SUCCESS_SUBTITLE}</p>
                    </div>
                  )}

                  {mode === "login" && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          checked={remember}
                          onCheckedChange={(v) => setRemember(v === true)}
                        />
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
                  )}

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

                {mode === "signup" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setLegalAccepted(false);
                      setErrors({});
                      setValidated(false);
                    }}
                    className="mt-5 w-full text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Já tenho conta
                  </button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
