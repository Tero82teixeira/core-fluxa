import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileStack,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LockKeyhole,
  Mail,
  MailCheck,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Workflow,
  Zap,
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
  { icon: CalendarCheck2, label: "Prioridades e prazos no lugar certo" },
  { icon: Workflow, label: "Clientes, processos e tarefas conectados" },
  { icon: ShieldCheck, label: "Equipe e dados protegidos por permissões" },
];

const CONNECTED_FLOW = [
  { icon: Users, label: "Clientes", detail: "Contexto centralizado" },
  { icon: FolderKanban, label: "Processos", detail: "Etapas acompanhadas" },
  { icon: ListChecks, label: "Tarefas", detail: "Responsáveis definidos" },
  { icon: FileStack, label: "Documentos", detail: "Arquivos conectados" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Apenas o e-mail é lembrado — a senha nunca sai do formulário. */
const REMEMBER_KEY = "fluxa-remember-email";

const SIGNUP_SUCCESS_TITLE = "Conta criada com sucesso.";
const SIGNUP_SUCCESS_SUBTITLE = "Estamos levando você para a configuração da empresa.";

function AuthBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="flex w-fit items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
      aria-label="FLUXA — voltar à página inicial"
    >
      <span
        className={`grid place-items-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/25 ${compact ? "size-9" : "size-10"}`}
      >
        <Sparkles className={compact ? "size-4" : "size-4.5"} aria-hidden />
      </span>
      <span
        className={`font-display font-semibold tracking-tight ${compact ? "text-lg" : "text-xl"}`}
      >
        FLUXA
      </span>
    </Link>
  );
}

function AuthSidePanel({ mode }: { mode: AuthMode }) {
  return (
    <section className="relative hidden min-h-dvh overflow-hidden bg-slate-950 px-10 py-9 text-white lg:flex lg:flex-col lg:justify-between xl:px-14 xl:py-11">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-40 -left-32 size-[32rem] rounded-full bg-blue-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-12rem] bottom-[-13rem] size-[34rem] rounded-full bg-cyan-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <AuthBrand />
      </div>

      <div className="relative my-10 max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
          {mode === "signup" ? (
            <>
              <Zap className="size-3.5" aria-hidden /> 14 dias grátis · sem cartão
            </>
          ) : (
            <>
              <LockKeyhole className="size-3.5" aria-hidden /> Acesso seguro à sua operação
            </>
          )}
        </div>

        <h1 className="mt-6 max-w-lg font-display text-4xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance xl:text-[3.25rem]">
          {mode === "signup"
            ? "Comece com clareza desde o primeiro dia."
            : "Sua operação continua de onde você parou."}
        </h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
          {mode === "signup"
            ? "Crie sua empresa, organize a primeira rotina e conheça todos os módulos da FLUXA no seu próprio ritmo."
            : "Entre para acompanhar clientes, processos, documentos, tarefas, prazos e decisões em um único lugar."}
        </p>

        <ul className="mt-7 grid gap-3">
          {BENEFITS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-slate-200">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-blue-300">
                <Icon className="size-4" aria-hidden />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <LayoutDashboard className="size-4 text-blue-300" aria-hidden /> Fluxo conectado
            </span>
            <span className="flex items-center gap-1.5 text-[0.65rem] font-medium text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400" /> Pronto para começar
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-white/10">
            {CONNECTED_FLOW.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="bg-slate-950/70 p-4">
                <Icon className="size-4 text-blue-300" aria-hidden />
                <p className="mt-3 text-xs font-semibold text-white">{label}</p>
                <p className="mt-1 text-[0.68rem] text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex items-center gap-2.5 text-xs text-slate-400">
        <ShieldCheck className="size-4 shrink-0 text-emerald-400" aria-hidden />
        Organizações isoladas, permissões por papel e ações protegidas.
      </div>
    </section>
  );
}

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
    <div className="grid min-h-dvh bg-slate-50 lg:grid-cols-[1.05fr_0.95fr] dark:bg-slate-950">
      <AuthSidePanel mode={mode} />

      <section className="relative flex min-h-dvh items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-blue-500/[0.06] to-transparent lg:hidden"
          aria-hidden
        />
        <div className="relative w-full max-w-[30rem]">
          <div className="mb-7 flex items-center justify-between lg:hidden">
            <AuthBrand compact />
            <Link
              to="/"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Página inicial
            </Link>
          </div>

          <Card className="w-full rounded-3xl border-border/80 bg-card/95 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur">
            <CardContent className="p-5 sm:p-8">
              <Link
                to="/"
                className="mb-6 hidden w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground lg:flex"
              >
                <ArrowLeft className="size-3.5" aria-hidden /> Voltar para a página inicial
              </Link>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
                    {mode === "login" ? "Acesso à plataforma" : "Teste gratuito"}
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                    {mode === "login" ? "Bem-vindo à FLUXA" : "Crie sua empresa na FLUXA"}
                  </h2>
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {mode === "login" ? (
                    <KeyRound className="size-4.5" aria-hidden />
                  ) : (
                    <Sparkles className="size-4.5" aria-hidden />
                  )}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {mode === "login"
                  ? "Entre para acessar sua central de operações."
                  : "Crie sua conta e experimente todos os recursos por 14 dias."}
              </p>

              {mode === "signup" && !needsConfirmation && (
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground">
                  {["14 dias grátis", "Sem cartão", "Até 5 usuários"].map((item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-emerald-600" aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
              )}

              {errors.form && (
                <div
                  role="alert"
                  className="mt-5 flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
                >
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                  <span>{errors.form}</span>
                </div>
              )}

              {mode === "signup" && !needsConfirmation && (
                <div className="mt-5 flex gap-3 rounded-xl border border-blue-200/70 bg-blue-50/70 px-3.5 py-3 text-sm dark:border-blue-900/60 dark:bg-blue-950/30">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-blue-700 dark:text-blue-300"
                    aria-hidden
                  />
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
                <div role="status" className="mt-7 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900">
                    <MailCheck className="size-6" aria-hidden />
                  </span>
                  <div className="mt-5">
                    <p className="font-display text-xl font-semibold tracking-tight text-foreground">
                      Confirme seu e-mail
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Enviamos um link para{" "}
                      <strong className="font-medium text-foreground">{email.trim()}</strong>. A
                      empresa e os 14 dias de teste serão liberados somente depois da confirmação.
                    </p>
                  </div>
                  <div className="mt-5 rounded-xl border bg-muted/30 p-3 text-left text-xs leading-5 text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">
                        1
                      </span>
                      Abra a mensagem enviada pela FLUXA.
                    </p>
                    <p className="mt-2 flex items-center gap-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">
                        2
                      </span>
                      Clique no link para ativar sua conta e continuar.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5 h-11 w-full"
                    onClick={resend}
                  >
                    <Mail className="size-4" aria-hidden /> Reenviar e-mail de confirmação
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setNeedsConfirmation(false);
                      setMode("login");
                    }}
                    className="mt-4 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Voltar para o login
                  </button>
                </div>
              ) : (
                <>
                  <form onSubmit={submit} noValidate className="mt-6 space-y-4.5">
                    {mode === "signup" && (
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-medium">
                          Nome completo
                        </Label>
                        <div className="relative">
                          <UserRound
                            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                          />
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
                            className="h-11.5 rounded-xl pl-10 transition-shadow duration-200 focus-visible:ring-2"
                          />
                        </div>
                        {errors.name && (
                          <p role="alert" className="text-xs text-destructive">
                            {errors.name}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium">
                        E-mail
                      </Label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
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
                          className="h-11.5 rounded-xl pl-10 transition-shadow duration-200 focus-visible:ring-2"
                        />
                      </div>
                      {errors.email && (
                        <p role="alert" className="text-xs text-destructive">
                          {errors.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-medium">
                        Senha
                      </Label>
                      <div className="relative">
                        <KeyRound
                          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
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
                          className="h-11.5 rounded-xl pr-11 pl-10 transition-shadow duration-200 focus-visible:ring-2"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {errors.password && (
                        <p role="alert" className="text-xs text-destructive">
                          {errors.password}
                        </p>
                      )}
                      {mode === "signup" && !errors.password && (
                        <div className="flex items-center justify-between gap-3" aria-live="polite">
                          <div className="flex flex-1 gap-1" aria-hidden>
                            {[1, 2, 3].map((step) => {
                              const strength =
                                password.length === 0
                                  ? 0
                                  : password.length < 6
                                    ? 1
                                    : password.length < 10
                                      ? 2
                                      : 3;
                              return (
                                <span
                                  key={step}
                                  className={`h-1 flex-1 rounded-full ${step <= strength ? "bg-emerald-500" : "bg-muted"}`}
                                />
                              );
                            })}
                          </div>
                          <span className="text-[0.7rem] text-muted-foreground">
                            Mínimo de 6 caracteres
                          </span>
                        </div>
                      )}
                    </div>

                    {mode === "signup" && (
                      <div className="space-y-2 rounded-xl border bg-muted/20 p-3.5">
                        <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-muted-foreground sm:text-sm">
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
                        {errors.legal && (
                          <p role="alert" className="text-xs text-destructive">
                            {errors.legal}
                          </p>
                        )}
                      </div>
                    )}

                    {validated && mode === "signup" && (
                      <div
                        role="status"
                        className="flex gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 text-sm text-foreground"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                        <span>
                          <span className="block font-medium">{SIGNUP_SUCCESS_TITLE}</span>
                          <span className="mt-0.5 block text-muted-foreground">
                            {SIGNUP_SUCCESS_SUBTITLE}
                          </span>
                        </span>
                      </div>
                    )}

                    {mode === "login" && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
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
                          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-600/20 active:scale-[0.99] disabled:opacity-70"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {mode === "login" ? "Entrando…" : "Criando conta…"}
                        </>
                      ) : mode === "login" ? (
                        <>
                          Entrar na FLUXA <ArrowRight className="size-4" aria-hidden />
                        </>
                      ) : (
                        <>
                          Criar conta e empresa <ArrowRight className="size-4" aria-hidden />
                        </>
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
                      className="mt-5 w-full rounded-lg py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Já possui uma conta?{" "}
                      <span className="font-semibold text-primary">Entrar</span>
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
