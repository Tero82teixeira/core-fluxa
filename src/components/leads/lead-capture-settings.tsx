import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useLeadCaptureForm,
  useSaveLeadCaptureForm,
  type LeadCaptureFormInput,
} from "@/hooks/use-lead-capture";

const DEFAULTS: LeadCaptureFormInput = {
  title: "Fale com nossa equipe",
  description: "Conte um pouco sobre o que você precisa e entraremos em contato.",
  success_message: "Recebemos seus dados. Nossa equipe entrará em contato em breve.",
  is_active: true,
};

export function LeadCaptureSettings({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const query = useLeadCaptureForm(organizationId);
  const save = useSaveLeadCaptureForm(organizationId);
  const [draft, setDraft] = useState<LeadCaptureFormInput>(DEFAULTS);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (query.data)
      setDraft({
        title: query.data.title,
        description: query.data.description,
        success_message: query.data.success_message,
        is_active: query.data.is_active,
      });
  }, [query.data]);

  const publicUrl = useMemo(() => {
    if (!query.data?.public_token || typeof window === "undefined") return "";
    return `${window.location.origin}/captar/${query.data.public_token}`;
  }, [query.data?.public_token]);

  const persist = async (rotateToken = false) => {
    if (
      draft.title.trim().length < 3 ||
      draft.description.trim().length < 3 ||
      draft.success_message.trim().length < 3
    ) {
      toast.error("Preencha os três textos da página de captação.");
      return;
    }
    try {
      await save.mutateAsync({ values: draft, rotateToken });
      toast.success(
        rotateToken
          ? "Novo link criado. O link anterior deixou de funcionar."
          : "Captação de leads configurada.",
      );
    } catch {
      toast.error("Não foi possível salvar a captação de leads.");
    }
  };

  const copy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o endereço manualmente.");
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4 text-primary" />
          Captação automática de leads
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Compartilhe um link público. Cada envio cria o lead, abre uma oportunidade no primeiro
          contato e avisa a equipe.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
          <div>
            <Label htmlFor="lead-form-active">Receber novos leads</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Desative para interromper o link sem apagar o histórico.
            </p>
          </div>
          <Switch
            id="lead-form-active"
            checked={draft.is_active}
            disabled={!canManage || save.isPending}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, is_active: checked }))
            }
          />
        </div>
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Título do formulário</span>
            <Input
              value={draft.title}
              maxLength={100}
              disabled={!canManage}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Orientação para o interessado</span>
            <Textarea
              value={draft.description}
              maxLength={500}
              rows={3}
              disabled={!canManage}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Mensagem após o envio</span>
            <Textarea
              value={draft.success_message}
              maxLength={300}
              rows={2}
              disabled={!canManage}
              onChange={(event) =>
                setDraft((current) => ({ ...current, success_message: event.target.value }))
              }
            />
          </label>
        </div>
        {query.data && (
          <div className="space-y-2 rounded-xl border bg-primary/[0.03] p-4">
            <Label htmlFor="lead-public-url">Link público da empresa</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="lead-public-url" value={publicUrl} readOnly className="bg-background" />
              <Button type="button" variant="outline" onClick={copy}>
                {copied ? <Check /> : <Clipboard />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              <Button asChild type="button" variant="outline">
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Abrir
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode colocar este endereço no site, Instagram, anúncios ou enviar diretamente a
              interessados.
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {query.data && canManage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" disabled={save.isPending}>
                  <RefreshCw />
                  Trocar link
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Trocar o link público?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O endereço atual deixará de funcionar imediatamente. Atualize os locais onde ele
                    foi divulgado depois de confirmar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Manter link atual</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void persist(true)}>
                    Criar novo link
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canManage && (
            <Button
              type="button"
              disabled={save.isPending || query.isLoading}
              onClick={() => void persist(false)}
            >
              {save.isPending
                ? "Salvando…"
                : query.data
                  ? "Salvar captação"
                  : "Criar link de captação"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
