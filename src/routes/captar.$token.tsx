import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchPublicLeadCaptureForm,
  submitPublicLead,
  type PublicLeadCaptureForm,
} from "@/hooks/use-lead-capture";

export const Route = createFileRoute("/captar/$token")({
  head: () => ({
    meta: [
      { title: "Fale com nossa equipe — FLUXA" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PublicLeadPage,
});

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  company: "",
  message: "",
  website: "",
  consent: false,
};

function PublicLeadPage() {
  const { token } = Route.useParams();
  const [form, setForm] = useState<PublicLeadCaptureForm | null>(null);
  const [values, setValues] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const source = useMemo(
    () =>
      typeof window === "undefined"
        ? "link"
        : new URLSearchParams(window.location.search).get("utm_source")?.slice(0, 80) || "link",
    [],
  );

  useEffect(() => {
    let active = true;
    void fetchPublicLeadCaptureForm(token)
      .then((result) => {
        if (active) setForm(result);
      })
      .catch(() => {
        if (active) setForm(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (values.name.trim().length < 2) {
      setError("Informe seu nome.");
      return;
    }
    if (!values.email.trim() && !values.phone.trim()) {
      setError("Informe um e-mail ou telefone para retorno.");
      return;
    }
    if (!values.consent) {
      setError("Autorize o uso dos dados para que a empresa possa entrar em contato.");
      return;
    }
    setSending(true);
    try {
      await submitPublicLead(token, { ...values, source });
      setSent(true);
    } catch {
      setError("Não foi possível enviar agora. Aguarde alguns minutos e tente novamente.");
    } finally {
      setSending(false);
    }
  };

  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <Loader2 className="size-7 animate-spin text-primary" aria-label="Carregando formulário" />
      </main>
    );
  if (!form)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-xl font-semibold">Formulário indisponível</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link foi desativado ou substituído. Solicite um novo endereço à empresa.
            </p>
          </CardContent>
        </Card>
      </main>
    );

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-background to-indigo-50 px-4 py-10 dark:from-slate-950 dark:via-background dark:to-blue-950/30 sm:py-16">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ArrowRight className="size-6" />
          </div>
          <p className="text-sm font-medium text-primary">{form.organization_name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{form.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{form.description}</p>
        </header>
        <Card className="border-primary/15 shadow-lg shadow-primary/5">
          {sent ? (
            <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
              <CheckCircle2 className="size-12 text-emerald-600" />
              <h2 className="mt-4 text-xl font-semibold">Dados enviados</h2>
              <p className="mt-2 max-w-md text-muted-foreground">{form.success_message}</p>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Seus dados para contato</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submit} noValidate>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <Label htmlFor="lead-name">Nome *</Label>
                      <Input
                        id="lead-name"
                        autoComplete="name"
                        maxLength={160}
                        value={values.name}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <Label htmlFor="lead-email">E-mail</Label>
                      <Input
                        id="lead-email"
                        type="email"
                        autoComplete="email"
                        maxLength={255}
                        value={values.email}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, email: event.target.value }))
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <Label htmlFor="lead-phone">Telefone</Label>
                      <Input
                        id="lead-phone"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={24}
                        value={values.phone}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, phone: event.target.value }))
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <Label htmlFor="lead-company">Empresa (opcional)</Label>
                      <Input
                        id="lead-company"
                        autoComplete="organization"
                        maxLength={160}
                        value={values.company}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, company: event.target.value }))
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm sm:col-span-2">
                      <Label htmlFor="lead-message">Como podemos ajudar? (opcional)</Label>
                      <Textarea
                        id="lead-message"
                        maxLength={2000}
                        rows={4}
                        value={values.message}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, message: event.target.value }))
                        }
                      />
                    </label>
                    <div className="hidden" aria-hidden>
                      <Label htmlFor="lead-website">Site</Label>
                      <Input
                        id="lead-website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={values.website}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, website: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                    <Checkbox
                      checked={values.consent}
                      onCheckedChange={(checked) =>
                        setValues((current) => ({ ...current, consent: checked === true }))
                      }
                    />
                    <span>
                      Autorizo {form.organization_name} a usar estes dados para entrar em contato
                      comigo. Consulte a{" "}
                      <a
                        className="font-medium text-primary underline-offset-4 hover:underline"
                        href="/politica-de-privacidade"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Política de Privacidade
                      </a>
                      .
                    </span>
                  </label>
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <div className="flex flex-col-reverse items-center justify-between gap-3 border-t pt-4 sm:flex-row">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck className="size-4" />
                      Seus dados serão enviados somente para {form.organization_name}.
                    </p>
                    <Button type="submit" disabled={sending}>
                      {sending && <Loader2 className="animate-spin" />}
                      {sending ? "Enviando…" : "Enviar contato"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Formulário seguro disponibilizado pelo FLUXA.
        </p>
      </div>
    </main>
  );
}
