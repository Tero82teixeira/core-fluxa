import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FilePlus2,
  ListTodo,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { GettingStartedProgress } from "@/hooks/use-getting-started";

type Step = {
  title: string;
  description: string;
  action: string;
  href: "/clientes/novo" | "/processos/novo" | "/tarefas" | null;
  icon: LucideIcon;
  done: boolean;
};

export function GettingStartedCard({ progress }: { progress: GettingStartedProgress }) {
  const steps: Step[] = [
    {
      title: "Empresa configurada",
      description: "Os dados iniciais da organização estão prontos.",
      action: "Concluído",
      href: null,
      icon: Building2,
      done: true,
    },
    {
      title: "Cadastre o primeiro cliente",
      description: "Comece a formar sua carteira de atendimento.",
      action: "Cadastrar cliente",
      href: "/clientes/novo",
      icon: UserPlus,
      done: progress.clients > 0,
    },
    {
      title: "Crie o primeiro processo",
      description: "Organize uma demanda com etapas, responsável e prazo.",
      action: "Criar processo",
      href: "/processos/novo",
      icon: FilePlus2,
      done: progress.processes > 0,
    },
    {
      title: "Planeje a primeira tarefa",
      description: "Registre o próximo trabalho que precisa ser executado.",
      action: "Abrir tarefas",
      href: "/tarefas",
      icon: ListTodo,
      done: progress.tasks > 0,
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  const percentage = Math.round((completed / steps.length) * 100);
  const next = steps.find((step) => !step.done);

  if (!next) return null;

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-cyan-500/[0.06] shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
              Primeiros passos
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Comece por aqui</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Siga esta sequência para transformar a empresa configurada em uma operação pronta para
              o dia a dia.
            </p>
          </div>
          <div className="min-w-52 rounded-xl border border-primary/10 bg-background/75 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Progresso inicial</span>
              <strong className="tabular-nums text-primary">
                {completed}/{steps.length}
              </strong>
            </div>
            <Progress
              value={percentage}
              className="mt-2 h-2"
              aria-label={`${percentage}% concluído`}
            />
          </div>
        </div>

        <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const current = step === next;
            return (
              <li
                key={step.title}
                className={cn(
                  "flex min-h-48 flex-col rounded-xl border bg-card/90 p-4",
                  step.done &&
                    "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
                  current && "border-primary/40 ring-2 ring-primary/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-lg bg-primary/10 text-primary",
                      step.done &&
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                    )}
                  >
                    {step.done ? (
                      <CheckCircle2 className="size-5" aria-hidden />
                    ) : (
                      <Icon className="size-5" aria-hidden />
                    )}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">
                  {step.description}
                </p>
                {step.done ? (
                  <p className="mt-3 flex h-8 items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4" aria-hidden />
                    Concluído
                  </p>
                ) : (
                  <Button
                    variant={current ? "default" : "ghost"}
                    size="sm"
                    className="mt-3 w-full justify-between"
                    asChild
                  >
                    <Link to={step.href!}>
                      {step.action}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>

        {progress.team <= 1 && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                <UsersRound className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium">Você trabalha com uma equipe?</p>
                <p className="text-xs text-muted-foreground">
                  O convite é opcional e não interfere na conclusão dos primeiros passos.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link to="/equipe">Convidar alguém</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
