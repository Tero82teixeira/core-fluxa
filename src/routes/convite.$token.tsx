import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ROLE, type AppRole } from "@/lib/domain";
import { buildLegalAcceptanceMetadata } from "@/lib/legal";
import { TEAM_MEMBER_LIMIT_MESSAGE } from "@/lib/team-management";
import { writeWorkspacePreference } from "@/lib/workspace-preference";

const INVITATION_STORAGE_KEY = "fluxa-pending-invitation";

export const Route = createFileRoute("/convite/$token")({ ssr: false, component: InvitationPage });

type Preview = {
  organization_name: string;
  email: string;
  role: AppRole;
  status: string;
  expires_at: string;
};
type AcceptResult = {
  organization_id: string;
  membership_id: string;
  role: AppRole;
  organization_name: string;
};

function invitationMessage(message: string) {
  if (message.includes("ORGANIZATION_MEMBER_LIMIT_REACHED")) return TEAM_MEMBER_LIMIT_MESSAGE;
  if (message.includes("INVITE_EMAIL_MISMATCH")) return "Este convite pertence a outro e-mail.";
  if (message.includes("INVITE_EXPIRED")) return "Este convite expirou.";
  if (message.includes("INVITE_ALREADY") || message.includes("INVITE_ALREADY_USED"))
    return "Este convite já foi utilizado.";
  if (message.includes("INVITE_CANCELLED")) return "Este convite foi cancelado.";
  if (message.includes("NOT_AUTHENTICATED"))
    return "Entre ou crie uma conta para aceitar o convite.";
  return "Não foi possível concluir o convite. Tente novamente.";
}

function InvitationPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [session, setSession] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(INVITATION_STORAGE_KEY, "1");
    Promise.all([
      supabase.rpc("invitation_preview", { _token: token }),
      supabase.auth.getSession(),
    ]).then(([p, s]) => {
      setPreview((p.data as Preview[] | null)?.[0] ?? null);
      setSession(Boolean(s.data.session));
      setLoading(false);
    });
    return () => window.localStorage.removeItem(INVITATION_STORAGE_KEY);
  }, [token]);

  async function accept() {
    setLoading(true);
    try {
      if (!preview) throw new Error("INVITE_NOT_FOUND");
      const current = await supabase.auth.getUser();
      if (!current.data.user) {
        if (!legalAccepted) throw new Error("Aceite os Termos de Uso e a Política de Privacidade.");
        if (password.length < 6 || password !== confirm)
          throw new Error("Confira a senha (mínimo de 6 caracteres).");
        const signed = await supabase.auth.signUp({
          email: preview.email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/convite/${token}`,
            data: {
              full_name: name.trim(),
              ...buildLegalAcceptanceMetadata("invitation"),
            },
          },
        });
        if (signed.error) throw signed.error;
        if (!signed.data.session) {
          toast.info("Confirme seu e-mail e retorne a este convite.");
          return;
        }
      }
      const result = await supabase.rpc("accept_invitation", { _token: token });
      if (result.error) throw result.error;
      const accepted = (result.data as AcceptResult[] | null)?.[0] ?? null;
      if (!accepted?.organization_id) throw new Error("INVITE_ACCEPT_EMPTY_RESULT");
      const acceptedBy = (await supabase.auth.getUser()).data.user;
      if (!acceptedBy) throw new Error("NOT_AUTHENTICATED");
      writeWorkspacePreference(window.localStorage, acceptedBy.id, accepted.organization_id);
      window.localStorage.removeItem(INVITATION_STORAGE_KEY);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-members", accepted.organization_id] }),
        queryClient.invalidateQueries({ queryKey: ["members", accepted.organization_id] }),
        queryClient.invalidateQueries({ queryKey: ["invitations", accepted.organization_id] }),
        queryClient.invalidateQueries({ queryKey: ["task-list", accepted.organization_id] }),
        queryClient.invalidateQueries({ queryKey: ["processes", accepted.organization_id] }),
        queryClient.invalidateQueries({ queryKey: ["monitoring", accepted.organization_id] }),
      ]);
      toast.success(`Convite aceito. Você entrou na empresa como ${ROLE[accepted.role].label}.`);
      await navigate({ to: "/meu-dia", replace: true });
    } catch (e) {
      const raw =
        e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      toast.error(
        raw.startsWith("Confira") || raw.startsWith("Aceite") ? raw : invitationMessage(raw),
      );
    } finally {
      setLoading(false);
    }
  }

  if (loading && !preview)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  const invalid =
    !preview || preview.status !== "pending" || new Date(preview.expires_at) < new Date();
  const invalidMessage =
    preview?.status === "expired" || (preview && new Date(preview.expires_at) < new Date())
      ? "Este convite expirou."
      : preview?.status === "accepted"
        ? "Este convite já foi utilizado."
        : preview?.status === "cancelled"
          ? "Este convite foi cancelado."
          : "Não foi possível concluir o convite. Tente novamente.";
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center gap-2 text-brand">
            <Building2 />
            <span className="font-display font-semibold">FLUXA</span>
          </div>
          {invalid ? (
            <>
              <h1 className="page-title">Convite indisponível</h1>
              <p className="text-sm text-muted-foreground">{invalidMessage}</p>
              <Button asChild variant="outline">
                <Link to="/entrar">Ir para o login</Link>
              </Button>
            </>
          ) : (
            <>
              <div>
                <h1 className="page-title">Entre para {preview.organization_name}</h1>
                <p className="page-subtitle">
                  Convite para {preview.email} como {ROLE[preview.role].label}.
                </p>
              </div>
              {!session && (
                <>
                  <div>
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirm">Confirmar senha</Label>
                    <Input
                      id="confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-muted-foreground">
                    <Checkbox
                      className="mt-0.5"
                      checked={legalAccepted}
                      onCheckedChange={(value) => setLegalAccepted(value === true)}
                    />
                    <span>
                      Li e aceito os{" "}
                      <Link to="/termos-de-uso" target="_blank" className="text-brand underline">
                        Termos de Uso
                      </Link>{" "}
                      e declaro ciência da{" "}
                      <Link
                        to="/politica-de-privacidade"
                        target="_blank"
                        className="text-brand underline"
                      >
                        Política de Privacidade
                      </Link>
                      .
                    </span>
                  </label>
                </>
              )}
              <Button
                className="w-full"
                disabled={loading || (!session && (!name.trim() || !legalAccepted))}
                onClick={accept}
              >
                {loading && <Loader2 className="animate-spin" />}
                {session ? "Aceitar convite" : "Criar conta e aceitar"}
              </Button>
              {!session && (
                <p className="text-center text-sm text-muted-foreground">
                  Já tem conta?{" "}
                  <Link to="/entrar" className="text-brand underline">
                    Entre e volte pelo link
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
