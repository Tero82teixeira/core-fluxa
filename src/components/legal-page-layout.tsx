import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { LEGAL_LAST_UPDATED_LABEL } from "@/lib/legal";

type LegalPageLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function LegalPageLayout({ title, description, children }: LegalPageLayoutProps) {
  return (
    <main className="min-h-dvh bg-muted/20 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-display font-semibold text-primary">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            FLUXA
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Voltar ao início
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Documento legal
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{description}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Versão 2026-08-30 · Atualizado em {LEGAL_LAST_UPDATED_LABEL}
        </p>

        <div className="mt-10 space-y-9 leading-7 text-muted-foreground [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:mt-3">
          {children}
        </div>
      </article>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-4xl flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-sm sm:px-6">
          <Link to="/termos-de-uso" className="text-muted-foreground hover:text-foreground">
            Termos de Uso
          </Link>
          <Link
            to="/politica-de-privacidade"
            className="text-muted-foreground hover:text-foreground"
          >
            Política de Privacidade
          </Link>
        </div>
      </footer>
    </main>
  );
}
