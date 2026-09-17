import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileClock,
  FileStack,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  MonitorCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRoundCheck,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FLUXA — Central inteligente de processos e operações" },
      {
        name: "description",
        content:
          "Centralize clientes, processos, documentos, tarefas, comunicação, monitoramento e financeiro. Experimente a FLUXA por 14 dias, sem cartão.",
      },
      {
        property: "og:title",
        content: "FLUXA — Sua operação inteira em um único fluxo",
      },
      {
        property: "og:description",
        content:
          "Mais clareza, controle e previsibilidade para empresas que trabalham com clientes, demandas e prazos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommercialLanding,
});

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: string;
};

const FEATURES: Feature[] = [
  {
    icon: CalendarCheck2,
    title: "Meu Dia",
    description: "Reúne prioridades, retornos e prazos para começar o dia sabendo onde agir.",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  {
    icon: LayoutDashboard,
    title: "Central de Comando",
    description: "Uma visão executiva da operação, com indicadores e pontos que exigem atenção.",
    tone: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
  {
    icon: Users,
    title: "Clientes",
    description: "Cadastros, contatos, histórico e relacionamento organizados em um só lugar.",
    tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
  },
  {
    icon: FileStack,
    title: "Processos",
    description: "Etapas, responsáveis, prazos e movimentações acompanhados até a conclusão.",
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  },
  {
    icon: FileClock,
    title: "Documentos",
    description: "Arquivos, versões, solicitações, aprovações e validades conectados à operação.",
    tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  },
  {
    icon: ListChecks,
    title: "Tarefas",
    description: "Lista, quadro e agenda com prioridades, responsáveis, filtros e prazos.",
    tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300",
  },
  {
    icon: MessageCircle,
    title: "Comunicação",
    description: "Conversas, retornos e contexto do atendimento preservados em uma timeline.",
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  },
  {
    icon: Activity,
    title: "Monitoramento",
    description: "Pendências e riscos operacionais priorizados antes que virem problemas.",
    tone: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
  {
    icon: CircleDollarSign,
    title: "Financeiro",
    description: "Contas, recebimentos, pagamentos e recorrências ligados à rotina da empresa.",
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  {
    icon: BarChart3,
    title: "Relatórios",
    description: "Indicadores operacionais, comerciais e financeiros para decisões mais claras.",
    tone: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
  },
  {
    icon: Bot,
    title: "Automações",
    description: "Regras e lembretes que reduzem tarefas repetitivas e mantêm o fluxo andando.",
    tone: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
  },
  {
    icon: UserRoundCheck,
    title: "Meu Portal",
    description: "Um espaço separado para o cliente acompanhar apenas o conteúdo autorizado.",
    tone: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
];

const AUDIENCES = [
  "Advocacia e escritórios jurídicos",
  "Contabilidade e consultorias",
  "Engenharia, arquitetura e projetos",
  "Imobiliárias e administradoras",
  "Clínicas e operações de atendimento",
  "Prestadores técnicos e empresas de serviços",
];

const FAQ = [
  {
    question: "Preciso informar cartão para começar?",
    answer:
      "Não. Você cria a conta e experimenta a FLUXA por 14 dias sem cadastrar cartão. Nenhuma cobrança é feita automaticamente no cadastro.",
  },
  {
    question: "A FLUXA funciona no celular?",
    answer:
      "Sim. A plataforma funciona pelo navegador no computador, tablet e celular, com telas adaptadas para cada tamanho.",
  },
  {
    question: "Posso convidar minha equipe?",
    answer:
      "Sim. O plano permite até 5 usuários ativos, com papéis e permissões diferentes para organizar o acesso da equipe.",
  },
  {
    question: "Os dados de uma empresa aparecem para outra?",
    answer:
      "Não. As organizações são isoladas e as permissões são verificadas no sistema e no banco de dados.",
  },
  {
    question: "A plataforma serve apenas para advocacia?",
    answer:
      "Não. Ela atende empresas que precisam organizar clientes, demandas, documentos, equipe, prazos e financeiro em um fluxo conectado.",
  },
];

function TrialLink({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "outline";
  className?: string;
}) {
  return (
    <Button asChild variant={variant} className={className}>
      <Link to="/entrar" search={{ mode: "signup" }}>
        {children}
      </Link>
    </Button>
  );
}

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      to="/"
      className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label="FLUXA — página inicial"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/25">
        <Sparkles className="size-4.5" aria-hidden />
      </span>
      <span
        className={`font-display text-lg font-semibold tracking-tight ${inverse ? "text-white" : ""}`}
      >
        FLUXA
      </span>
    </Link>
  );
}

const PREVIEW_NAV = [
  [CalendarCheck2, "Meu Dia"],
  [LayoutDashboard, "Central"],
  [Users, "Clientes"],
  [FileStack, "Processos"],
  [ListChecks, "Tarefas"],
] as const;

function ProductPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[43rem] lg:mx-0"
      aria-label="Prévia ilustrativa da Central de Comando da FLUXA"
    >
      <div className="absolute -inset-8 rounded-full bg-blue-500/20 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/15 bg-slate-900 shadow-[0_35px_90px_-30px_rgba(15,23,42,0.9)] ring-1 ring-white/5">
        <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
          <span className="size-2.5 rounded-full bg-rose-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 hidden h-6 flex-1 items-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-[0.55rem] text-slate-500 sm:flex">
            Buscar em tudo…
          </span>
          <span className="ml-auto rounded-md bg-blue-500 px-2.5 py-1 text-[0.55rem] font-semibold text-white">
            + Criar
          </span>
        </div>

        <div className="grid min-h-[23rem] grid-cols-[4.5rem_1fr] sm:grid-cols-[9rem_1fr]">
          <aside className="border-r border-white/10 bg-slate-950/70 p-2.5 sm:p-3" aria-hidden>
            <div className="mb-5 flex items-center gap-2 px-1">
              <span className="grid size-7 place-items-center rounded-lg bg-blue-500 text-white">
                <Sparkles className="size-3.5" />
              </span>
              <span className="hidden text-xs font-semibold text-white sm:block">FLUXA</span>
            </div>
            <div className="space-y-1.5">
              {PREVIEW_NAV.map(([Icon, label], index) => (
                <div
                  key={label}
                  className={`flex h-8 items-center gap-2 rounded-lg px-2 ${
                    index === 1 ? "bg-blue-500/15 text-blue-300" : "text-slate-500"
                  }`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="hidden truncate text-[0.6rem] font-medium sm:block">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 bg-[#0f141c] p-3 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.55rem] font-semibold tracking-[0.16em] text-blue-400 uppercase">
                  Visão operacional
                </p>
                <p className="mt-1 text-sm font-semibold text-white sm:text-base">
                  Central de Comando
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[0.5rem] font-semibold text-emerald-300">
                Operação ativa
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Tarefas abertas", "8", "text-amber-300"],
                ["Processos ativos", "12", "text-violet-300"],
                ["Documentos", "24", "text-blue-300"],
                ["Alertas críticos", "0", "text-emerald-300"],
              ].map(([label, value, color]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5"
                >
                  <p className="min-h-6 text-[0.48rem] leading-3 text-slate-500 uppercase">
                    {label}
                  </p>
                  <p className={`mt-1 text-lg font-semibold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[0.62rem] font-semibold text-white">Precisa de atenção</p>
                  <Gauge className="size-3.5 text-orange-400" />
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    ["Prazo se aproxima", "Processo Teste 001", "bg-amber-400"],
                    ["Retorno programado", "Cliente Demonstração", "bg-cyan-400"],
                    ["Documento pendente", "Solicitação aberta", "bg-violet-400"],
                  ].map(([title, detail, dot]) => (
                    <div
                      key={title}
                      className="flex items-center gap-2 rounded-lg bg-white/[0.035] p-2"
                    >
                      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.52rem] font-medium text-slate-200">
                          {title}
                        </span>
                        <span className="block truncate text-[0.47rem] text-slate-600">
                          {detail}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-gradient-to-b from-blue-500/10 to-white/[0.03] p-3">
                <TrendingUp className="size-4 text-blue-300" />
                <p className="mt-3 text-[0.55rem] text-slate-500">Conclusões na semana</p>
                <p className="mt-1 text-2xl font-semibold text-white">18</p>
                <div className="mt-3 flex h-10 items-end gap-1" aria-hidden>
                  {[35, 62, 48, 80, 68, 92, 76].map((height, index) => (
                    <span
                      key={`${height}-${index}`}
                      className="flex-1 rounded-sm bg-blue-400/60"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -right-2 -bottom-5 hidden items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-3 py-2.5 text-xs font-medium text-white shadow-2xl sm:flex lg:-right-5">
        <span className="grid size-7 place-items-center rounded-lg bg-emerald-400/10">
          <CheckCircle2 className="size-4 text-emerald-400" aria-hidden />
        </span>
        <span>
          <span className="block text-[0.55rem] text-slate-400">Status da operação</span>
          Tudo sob controle
        </span>
      </div>
    </div>
  );
}

function CommercialLanding() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="bg-slate-950 text-white">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Brand inverse />
            <nav
              className="hidden items-center gap-6 text-sm text-slate-400 md:flex"
              aria-label="Navegação principal"
            >
              <a href="#recursos" className="transition-colors hover:text-white">
                Recursos
              </a>
              <a href="#como-funciona" className="transition-colors hover:text-white">
                Como funciona
              </a>
              <a href="#para-quem" className="transition-colors hover:text-white">
                Para quem
              </a>
              <a href="#seguranca" className="transition-colors hover:text-white">
                Segurança
              </a>
              <a href="#preco" className="transition-colors hover:text-white">
                Preço
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                asChild
                className="hidden text-slate-300 hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                <Link to="/entrar" search={{ mode: "login" }}>
                  Entrar
                </Link>
              </Button>
              <TrialLink className="bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-400">
                Testar grátis
              </TrialLink>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden border-b border-white/10">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.19),transparent_32%),radial-gradient(circle_at_82%_42%,rgba(14,165,233,0.13),transparent_34%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:px-8 lg:pt-24 lg:pb-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
                <Zap className="size-3.5" aria-hidden /> Central inteligente de processos e
                operações
              </div>
              <h1 className="mt-7 max-w-2xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.75rem]">
                Transforme uma rotina complexa em uma operação{" "}
                <span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
                  clara e previsível.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
                Conecte clientes, processos, documentos, tarefas, comunicação, monitoramento e
                financeiro. Sua equipe sabe o que fazer, quem é o responsável e qual é o próximo
                prazo.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <TrialLink className="h-12 bg-blue-500 px-6 text-base text-white shadow-xl shadow-blue-500/20 hover:bg-blue-400">
                  Começar 14 dias grátis <ArrowRight className="size-4" aria-hidden />
                </TrialLink>
                <Button
                  variant="outline"
                  className="h-12 border-white/15 bg-white/[0.04] px-6 text-base text-white hover:bg-white/10 hover:text-white"
                  asChild
                >
                  <a href="#recursos">Explorar a plataforma</a>
                </Button>
              </div>
              <ul
                className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400"
                aria-label="Condições do teste"
              >
                {["14 dias grátis", "Sem cartão", "Todos os módulos", "Até 5 usuários"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-1.5">
                      <Check className="size-4 text-emerald-400" aria-hidden /> {item}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <ProductPreview />
          </div>
        </section>
      </div>

      <section className="border-b bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y px-4 sm:px-6 md:grid-cols-4 md:divide-y-0 lg:px-8">
          {[
            [MonitorCheck, "Visão centralizada", "Informação conectada"],
            [UserRoundCheck, "Responsabilidade clara", "Cada demanda tem um dono"],
            [Clock3, "Prazos acompanhados", "Antecipe o que exige atenção"],
            [ShieldCheck, "Histórico preservado", "Movimentos rastreáveis"],
          ].map(([Icon, title, description]) => {
            const ValueIcon = Icon as LucideIcon;
            return (
              <div key={String(title)} className="flex gap-3 px-3 py-6 sm:px-5 sm:py-8">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary">
                  <ValueIcon className="size-4.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-xs font-semibold sm:text-sm">{String(title)}</span>
                  <span className="mt-1 hidden text-xs text-muted-foreground sm:block">
                    {String(description)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
              Menos improviso. Mais controle.
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              O trabalho deixa de ficar espalhado e passa a seguir um fluxo
            </h2>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              [
                Workflow,
                "Tudo conectado",
                "Cliente, processo, documento, tarefa e financeiro deixam de existir como informações isoladas.",
                "Você encontra o contexto sem procurar em várias ferramentas.",
              ],
              [
                Activity,
                "Atenção no que importa",
                "Prazos, pendências e retornos aparecem nas telas operacionais antes de serem esquecidos.",
                "A equipe trabalha por prioridade, não por memória.",
              ],
              [
                TrendingUp,
                "Decisões com clareza",
                "Indicadores e relatórios mostram o andamento da operação, da equipe e das finanças.",
                "A gestão acompanha o presente e prepara o próximo passo.",
              ],
            ].map(([Icon, title, description, detail], index) => {
              const BenefitIcon = Icon as LucideIcon;
              return (
                <article
                  key={String(title)}
                  className="group relative overflow-hidden rounded-3xl border bg-card p-6 shadow-soft sm:p-7"
                >
                  <span className="absolute top-5 right-6 font-display text-5xl font-semibold text-primary/[0.06]">
                    0{index + 1}
                  </span>
                  <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/15">
                    <BenefitIcon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-6 text-xl font-semibold">{String(title)}</h3>
                  <p className="mt-3 leading-7 text-muted-foreground">{String(description)}</p>
                  <p className="mt-5 border-t pt-5 text-sm font-medium">{String(detail)}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="recursos" className="scroll-mt-20 border-y bg-muted/25 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
              Uma operação conectada
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Da rotina diária à visão gerencial, dentro da mesma plataforma
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              Cada módulo resolve uma parte do trabalho. Juntos, eles mostram o que aconteceu, o que
              está em andamento e o que precisa ser feito.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, description, tone }) => (
              <article
                key={title}
                className="group rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid size-11 place-items-center rounded-xl ${tone}`}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                Comece sem complicação
              </p>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Da conta criada à primeira rotina organizada
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                A configuração inicial orienta os dados essenciais. Depois, você pode testar cada
                módulo no ritmo da sua empresa.
              </p>
              <TrialLink className="mt-7 h-11">
                Criar minha conta <ArrowRight className="size-4" aria-hidden />
              </TrialLink>
            </div>
            <ol className="relative grid gap-4 sm:grid-cols-3">
              <span
                className="absolute top-8 right-[16%] left-[16%] hidden border-t border-dashed border-primary/25 sm:block"
                aria-hidden
              />
              {[
                ["01", "Crie e confirme", "Cadastre outro e-mail e confirme a mensagem recebida."],
                [
                  "02",
                  "Configure o escritório",
                  "Complete as etapas iniciais com os dados da organização.",
                ],
                ["03", "Teste o fluxo", "Cadastre dados fictícios e percorra a operação completa."],
              ].map(([number, title, description]) => (
                <li key={number} className="relative rounded-2xl border bg-card p-5 shadow-sm">
                  <span className="grid size-12 place-items-center rounded-full border-4 border-background bg-primary font-display text-sm font-semibold text-primary-foreground shadow-md">
                    {number}
                  </span>
                  <h3 className="mt-5 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="para-quem" className="scroll-mt-20 border-y bg-muted/25 py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-slate-950 p-7 text-white shadow-2xl sm:p-9">
            <div
              className="absolute -top-28 -right-24 size-72 rounded-full bg-blue-500/20 blur-3xl"
              aria-hidden
            />
            <span className="relative grid size-12 place-items-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-500/20">
              <Building2 className="size-6" aria-hidden />
            </span>
            <h2 className="relative mt-6 font-display text-3xl font-semibold tracking-tight text-balance">
              Para empresas que precisam entregar com organização e previsibilidade
            </h2>
            <p className="relative mt-4 leading-7 text-slate-300">
              A FLUXA acompanha operações que trabalham com clientes, demandas, documentos, equipe e
              prazos — sem limitar a empresa a um único segmento.
            </p>
            <div className="relative mt-7 flex items-center gap-3 border-t border-white/10 pt-6 text-sm text-slate-300">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden /> Configuração
              guiada para começar com segurança
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
              Para quem é a FLUXA
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {AUDIENCES.map((audience) => (
                <li
                  key={audience}
                  className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm font-medium shadow-sm"
                >
                  <CheckCircle2 className="mt-0.5 size-4.5 shrink-0 text-emerald-600" aria-hidden />
                  {audience}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="seguranca" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
              <ShieldCheck className="size-4" aria-hidden /> Segurança desde a base
            </div>
            <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Os dados de cada empresa permanecem no lugar certo
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              A estrutura separa organizações, controla permissões e protege operações sensíveis no
              banco de dados.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                LockKeyhole,
                "Isolamento por empresa",
                "Cada usuário acessa somente as organizações às quais pertence.",
              ],
              [
                Users,
                "Papéis e permissões",
                "Acessos diferentes para propriedade, gestão, operação e visualização.",
              ],
              [
                ShieldCheck,
                "Ações protegidas",
                "Operações sensíveis são validadas também no banco de dados.",
              ],
              [
                FileClock,
                "Auditoria",
                "Movimentações importantes permanecem registradas para acompanhamento.",
              ],
            ].map(([Icon, title, description]) => {
              const SecurityIcon = Icon as LucideIcon;
              return (
                <article key={String(title)} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                    <SecurityIcon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-5 font-semibold">{String(title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {String(description)}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="preco" className="scroll-mt-20 border-y bg-slate-950 py-20 text-white sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold tracking-[0.14em] text-blue-300 uppercase">
              Plano simples e transparente
            </p>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Conheça toda a plataforma antes de decidir
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-300">
              Durante 14 dias, sua empresa pode testar os módulos, cadastrar dados fictícios e
              avaliar o fluxo completo sem informar cartão.
            </p>
            <ul className="mt-7 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
              {[
                "Todos os módulos incluídos",
                "Até 5 usuários ativos",
                "Portal separado para clientes",
                "Automações e relatórios",
                "Uso no computador e celular",
                "Sem cobrança no cadastro",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-emerald-400" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/[0.06] p-6 shadow-2xl backdrop-blur sm:p-8">
            <p className="text-sm font-medium text-blue-200">FLUXA Essencial Mensal</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                R$ 149,90
              </span>
              <span className="pb-1.5 text-sm text-slate-400">/mês</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              A assinatura só é iniciada quando você escolher contratar depois do teste.
            </p>
            <TrialLink className="mt-7 h-12 w-full bg-blue-500 text-base text-white shadow-xl shadow-blue-500/20 hover:bg-blue-400">
              Começar teste gratuito <ArrowRight className="size-4" aria-hidden />
            </TrialLink>
            <p className="mt-4 text-center text-xs text-slate-500">
              14 dias grátis · sem cartão · ativação por e-mail
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.65fr_1.35fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
              Perguntas frequentes
            </p>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-balance">
              Antes de começar seu teste
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              As informações essenciais para criar sua conta e conhecer a FLUXA com tranquilidade.
            </p>
          </div>
          <div className="space-y-3">
            {FAQ.map(({ question, answer }) => (
              <details
                key={question}
                className="group rounded-2xl border bg-card px-5 py-1 shadow-sm open:border-primary/20 open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold marker:hidden">
                  {question}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-transform group-open:rotate-90">
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </summary>
                <p className="border-t pb-5 pt-4 text-sm leading-6 text-muted-foreground">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground shadow-2xl shadow-primary/20 sm:px-12 sm:py-16">
          <div
            className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full bg-white/10 blur-3xl"
            aria-hidden
          />
          <Sparkles className="relative mx-auto size-7" aria-hidden />
          <h2 className="relative mx-auto mt-5 max-w-3xl font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Sua empresa pode trabalhar com mais clareza a partir de hoje
          </h2>
          <p className="relative mx-auto mt-4 max-w-2xl text-primary-foreground/80">
            Crie sua conta, configure a organização e conheça todos os recursos da FLUXA durante 14
            dias.
          </p>
          <TrialLink className="relative mt-8 h-12 bg-white px-6 text-base text-primary hover:bg-white/90">
            Começar meus 14 dias grátis <ArrowRight className="size-4" aria-hidden />
          </TrialLink>
        </div>
      </section>

      <footer className="border-t bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end lg:px-8">
          <div>
            <Brand inverse />
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
              Central inteligente de processos e operações para empresas que precisam de clareza,
              controle e previsibilidade.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <Link to="/termos-de-uso" className="text-slate-400 hover:text-white">
              Termos
            </Link>
            <Link to="/politica-de-privacidade" className="text-slate-400 hover:text-white">
              Privacidade
            </Link>
            <Link
              to="/entrar"
              search={{ mode: "login" }}
              className="text-slate-400 hover:text-white"
            >
              Entrar
            </Link>
            <Link
              to="/entrar"
              search={{ mode: "signup" }}
              className="font-medium text-blue-300 hover:text-blue-200"
            >
              Testar grátis
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-5 text-xs text-slate-600 sm:px-6 lg:px-8">
            FLUXA — Gestão empresarial em um único fluxo.
          </div>
        </div>
      </footer>
    </main>
  );
}
