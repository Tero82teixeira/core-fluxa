import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileClock,
  FileStack,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FLUXA — Gestão empresarial em um único fluxo" },
      {
        name: "description",
        content: "Organize clientes, processos, documentos, tarefas, comunicação e financeiro. Experimente a FLUXA por 14 dias.",
      },
      { property: "og:title", content: "FLUXA — Sua operação inteira em um único fluxo" },
      {
        property: "og:description",
        content: "Mais clareza, controle e produtividade para a rotina da sua empresa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommercialLanding,
});

type Feature = { icon: LucideIcon; title: string; description: string; tone: string };

const FEATURES: Feature[] = [
  {
    icon: LayoutDashboard,
    title: "Central de Comando",
    description: "Prioridades, prazos e alertas reunidos para você decidir o que precisa de atenção primeiro.",
    tone: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
  {
    icon: Users,
    title: "Clientes",
    description: "Carteira organizada, histórico de relacionamento e visão completa de cada cliente.",
    tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  },
  {
    icon: FileStack,
    title: "Processos",
    description: "Etapas, responsáveis, prazos e movimentações acompanhados do início à conclusão.",
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
  {
    icon: FileClock,
    title: "Documentos",
    description: "Arquivos, versões, aprovações e validades conectados à operação da empresa.",
    tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  },
  {
    icon: ListChecks,
    title: "Tarefas",
    description: "Agenda da equipe com prioridades, responsáveis e acompanhamento do trabalho diário.",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  {
    icon: MessageCircle,
    title: "Comunicação",
    description: "Conversas, retornos e observações internas preservados em uma timeline organizada.",
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  },
  {
    icon: CircleDollarSign,
    title: "Financeiro",
    description: "Contas, recebimentos, pagamentos e visão de saldo ligados à rotina da empresa.",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  {
    icon: Bot,
    title: "Automações",
    description: "Regras seguras para reduzir tarefas repetitivas, avisar a equipe e manter o fluxo andando.",
    tone: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
  },
];

const AUDIENCES = [
  "Empresas de serviços",
  "Escritórios e consultorias",
  "Clínicas e operações de atendimento",
  "Engenharia, arquitetura e projetos",
  "Imobiliárias e administradoras",
  "Equipes que controlam clientes e prazos",
];

const METRICS = [
  {
    label: "Tarefas atrasadas",
    value: "0",
    color: "border-rose-400 bg-rose-50 dark:bg-rose-950/20",
  },
  {
    label: "Processos críticos",
    value: "0",
    color: "border-violet-400 bg-violet-50 dark:bg-violet-950/20",
  },
  {
    label: "Retornos atrasados",
    value: "0",
    color: "border-cyan-400 bg-cyan-50 dark:bg-cyan-950/20",
  },
  {
    label: "Próximos vencimentos",
    value: "4",
    color: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20",
  },
];

function TrialLink({ children, variant = "default", className }: { children: React.ReactNode; variant?: "default" | "outline"; className?: string }) {
  return (
    <Button asChild variant={variant} className={className}>
      <Link to="/entrar" search={{ mode: "signup" }}>
        {children}
      </Link>
    </Button>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <Sparkles className="size-4.5" aria-hidden />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">FLUXA</span>
    </Link>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto max-w-2xl lg:mx-0" aria-label="Prévia da Central de Comando da FLUXA">
      <div className="absolute -inset-8 -z-10 rounded-full bg-blue-500/15 blur-3xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-blue-200/70 bg-card shadow-2xl shadow-blue-950/15 dark:border-blue-900/60">
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
          <span className="size-2.5 rounded-full bg-rose-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 h-5 flex-1 rounded-md bg-muted" />
        </div>
        <div className="grid grid-cols-[76px_1fr] sm:grid-cols-[132px_1fr]">
          <aside className="border-r bg-muted/20 p-3" aria-hidden>
            <div className="mb-5 flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="size-3.5" />
              </span>
              <span className="hidden text-xs font-semibold sm:block">FLUXA</span>
            </div>
            <div className="space-y-2">
              {["bg-blue-100", "bg-cyan-100", "bg-violet-100", "bg-indigo-100", "bg-amber-100"].map((tone, index) => (
                <div key={tone} className={`flex h-7 items-center gap-2 rounded-md px-1.5 ${index === 0 ? "bg-blue-50" : ""}`}>
                  <span className={`size-5 rounded-md ${tone}`} />
                  <span className="hidden h-1.5 flex-1 rounded bg-muted sm:block" />
                </div>
              ))}
            </div>
          </aside>
          <div className="min-w-0 p-3 sm:p-5">
            <div className="rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-card to-card p-4 dark:border-blue-900/60 dark:from-blue-950/30">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <LayoutDashboard className="size-4" />
                </span>
                <div>
                  <p className="text-[0.55rem] font-semibold tracking-wider text-primary uppercase">Visão operacional</p>
                  <p className="text-sm font-semibold sm:text-base">Central de Comando</p>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {METRICS.map((metric) => (
                <div key={metric.label} className={`rounded-lg border-t-2 p-2.5 sm:p-3 ${metric.color}`}>
                  <p className="min-h-6 text-[0.55rem] leading-3 font-medium text-muted-foreground uppercase sm:text-[0.65rem]">{metric.label}</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-700 sm:text-xl">{metric.value}</p>
                  <p className="text-[0.55rem] text-muted-foreground">{metric.value === "0" ? "Tudo em dia" : "Acompanhar"}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Precisa de atenção</p>
                <Gauge className="size-4 text-orange-500" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-4/5 rounded bg-muted" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -bottom-4 flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs font-medium shadow-xl sm:-right-6">
        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        Operação sob controle
      </div>
    </div>
  );
}

function CommercialLanding() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="Navegação principal">
            <a href="#recursos" className="transition-colors hover:text-foreground">
              Recursos
            </a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">
              Como funciona
            </a>
            <a href="#para-quem" className="transition-colors hover:text-foreground">
              Para quem
            </a>
            <a href="#seguranca" className="transition-colors hover:text-foreground">
              Segurança
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/entrar" search={{ mode: "login" }}>
                Entrar
              </Link>
            </Button>
            <TrialLink className="shadow-md shadow-primary/15">Testar grátis</TrialLink>
          </div>
        </div>
      </header>

      <section className="relative border-b border-border/60">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,color-mix(in_oklab,var(--color-primary)_12%,transparent),transparent_35%),radial-gradient(circle_at_85%_65%,color-mix(in_oklab,var(--color-brand)_10%,transparent),transparent_35%)]" />
        <div className="mx-auto grid max-w-7xl gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" aria-hidden />
              14 dias para experimentar todos os recursos
            </div>
            <h1 className="mt-6 font-display text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.55rem]">
              Sua operação inteira, <span className="text-primary">organizada em um único fluxo.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              A FLUXA conecta clientes, processos, documentos, tarefas, comunicação e financeiro para sua empresa trabalhar com mais clareza, controle e produtividade.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <TrialLink className="h-12 px-6 text-base shadow-lg shadow-primary/20">
                Começar teste grátis <ArrowRight className="size-4" aria-hidden />
              </TrialLink>
              <Button variant="outline" className="h-12 px-6 text-base" asChild>
                <a href="#recursos">Conhecer os recursos</a>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="Condições do teste">
              {["14 dias grátis", "Sem cartão", "Configuração guiada"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-emerald-600" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="border-b bg-muted/20">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 text-center sm:px-6 md:grid-cols-4 lg:px-8">
          {[
            ["Visão centralizada", "Menos telas e planilhas soltas"],
            ["Responsabilidade clara", "Cada demanda com seu responsável"],
            ["Prazos acompanhados", "Alertas antes de perder o controle"],
            ["Histórico preservado", "Decisões e movimentos rastreáveis"],
          ].map(([title, description]) => (
            <div key={title}>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="recursos" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-primary">UMA OPERAÇÃO CONECTADA</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Tudo o que sua equipe precisa para o trabalho avançar</h2>
            <p className="mt-4 text-muted-foreground">Cada módulo resolve uma parte da rotina. Juntos, eles mostram o que está acontecendo e o que precisa ser feito.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, description, tone }) => (
              <article key={title} className="group rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <span className={`grid size-11 place-items-center rounded-xl ${tone}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 border-y bg-muted/20 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-primary">COMECE SEM COMPLICAÇÃO</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Da conta criada à operação organizada</h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                A configuração inicial conduz você pelos dados essenciais da empresa. Depois, cada módulo pode ser preenchido no ritmo da sua equipe.
              </p>
              <TrialLink className="mt-7 h-11">
                Criar minha empresa <ArrowRight className="size-4" />
              </TrialLink>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3">
              {[
                ["01", "Crie sua conta", "Informe seu nome, e-mail e uma senha segura."],
                ["02", "Configure a empresa", "Complete as quatro etapas rápidas do cadastro inicial."],
                ["03", "Organize a operação", "Cadastre clientes, demandas, prazos e sua equipe."],
              ].map(([number, title, description]) => (
                <li key={number} className="relative rounded-2xl border bg-card p-5 shadow-sm">
                  <span className="font-display text-3xl font-semibold text-primary/25">{number}</span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="para-quem" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.10] via-card to-cyan-500/[0.07] p-6 shadow-sm sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Building2 className="size-6" aria-hidden />
            </span>
            <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight">Feita para empresas que precisam controlar rotinas, clientes e prazos</h2>
            <p className="mt-4 leading-7 text-muted-foreground">A FLUXA se adapta à operação sem obrigar sua empresa a trabalhar como uma ferramenta genérica determina.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">PARA QUEM É A FLUXA</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {AUDIENCES.map((audience) => (
                <li key={audience} className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm font-medium shadow-sm">
                  <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-600" aria-hidden />
                  {audience}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="seguranca" className="scroll-mt-20 border-y bg-slate-950 py-20 text-white sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-blue-200">
              <ShieldCheck className="size-4" aria-hidden /> SEGURANÇA DESDE A BASE
            </div>
            <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Os dados de cada empresa permanecem no lugar certo</h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-300">
              A arquitetura foi construída para separar organizações, controlar permissões e registrar ações importantes sem expor dados entre empresas.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [LockKeyhole, "Isolamento por empresa", "Cada usuário acessa somente as organizações às quais pertence."],
              [Users, "Papéis e permissões", "Proprietário, gestão, operação e visualização com acessos definidos."],
              [ShieldCheck, "Ações protegidas", "Operações sensíveis são validadas também no banco de dados."],
              [FileClock, "Auditoria", "Movimentações importantes permanecem registradas para acompanhamento."],
            ].map(([Icon, title, description]) => {
              const SecurityIcon = Icon as LucideIcon;
              return (
                <article key={String(title)} className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
                  <SecurityIcon className="size-5 text-blue-300" aria-hidden />
                  <h3 className="mt-4 font-semibold">{String(title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{String(description)}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground shadow-2xl shadow-primary/20 sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
            <Sparkles className="relative mx-auto size-7" aria-hidden />
            <h2 className="relative mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Sua empresa pode começar a trabalhar com mais clareza hoje</h2>
            <p className="relative mx-auto mt-4 max-w-2xl text-primary-foreground/80">Crie sua conta, configure a empresa e conheça todos os recursos da FLUXA durante 14 dias.</p>
            <TrialLink className="relative mt-8 h-12 bg-white px-6 text-base text-primary hover:bg-white/90">
              Começar meus 14 dias grátis <ArrowRight className="size-4" aria-hidden />
            </TrialLink>
          </div>
        </div>
      </section>

      <footer className="border-t bg-muted/20">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Brand />
          <p className="text-sm text-muted-foreground">Gestão empresarial em um único fluxo.</p>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/termos-de-uso" className="text-muted-foreground hover:text-foreground">
              Termos
            </Link>
            <Link to="/politica-de-privacidade" className="text-muted-foreground hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/entrar" search={{ mode: "login" }} className="text-muted-foreground hover:text-foreground">
              Entrar
            </Link>
            <Link to="/entrar" search={{ mode: "signup" }} className="font-medium text-primary hover:underline">
              Testar grátis
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
