import { useState } from "react";
import { Check, Copy, Link2, Loader2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

import {
  useCancelClientPortalInvitation,
  useClientPortal,
  useCreateClientPortalInvitation,
  useSetClientPortalAccessActive,
} from "@/hooks/use-client-portal";
import { describeClientPortalError, effectivePortalInvitationStatus } from "@/lib/client-portal";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/shared/status-badge";

const STATUS = {
  pending: { label: "Pendente", tone: "warning" as const },
  accepted: { label: "Aceito", tone: "success" as const },
  expired: { label: "Expirado", tone: "neutral" as const },
  cancelled: { label: "Cancelado", tone: "neutral" as const },
};

export function ClientPortalPanel({
  organizationId,
  clientId,
  clientEmail,
}: {
  organizationId: string;
  clientId: string;
  clientEmail: string | null;
}) {
  const portal = useClientPortal(organizationId, clientId, true);
  const createInvitation = useCreateClientPortalInvitation(organizationId, clientId);
  const cancelInvitation = useCancelClientPortalInvitation(organizationId, clientId);
  const setAccessActive = useSetClientPortalAccessActive(organizationId, clientId);
  const [email, setEmail] = useState(clientEmail ?? "");
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    try {
      const result = await createInvitation.mutateAsync(email);
      setFreshLink(result.url);
      setCopied(false);
      toast.success("Convite criado. Copie o link e envie ao cliente.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function copy() {
    if (!freshLink) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link manualmente.");
    }
  }

  async function cancel(invitationId: string) {
    try {
      await cancelInvitation.mutateAsync(invitationId);
      if (portal.data?.invitations[0]?.id === invitationId) setFreshLink(null);
      toast.success("Convite cancelado.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  async function toggleAccess(accessId: string, active: boolean) {
    try {
      await setAccessActive.mutateAsync({ accessId, active });
      toast.success(active ? "Acesso reativado." : "Acesso desativado.");
    } catch (error) {
      toast.error(describeClientPortalError(error));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">Convidar para o Portal do Cliente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                O cliente cria a própria conta pelo link. Esse acesso não ocupa vaga da equipe e não
                libera os módulos internos da empresa.
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="portal-client-email">E-mail do cliente</Label>
              <Input
                id="portal-client-email"
                type="email"
                placeholder="cliente@exemplo.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Button
              onClick={() => void create()}
              disabled={!email.trim() || createInvitation.isPending}
            >
              {createInvitation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )}
              Gerar convite
            </Button>
          </div>

          {freshLink && (
            <div className="rounded-lg border border-success/25 bg-success/5 p-4">
              <p className="text-sm font-medium">Link pronto para compartilhar</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  value={freshLink}
                  aria-label="Link do convite do Portal do Cliente"
                />
                <Button variant="outline" onClick={() => void copy()}>
                  {copied ? (
                    <Check className="size-4" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Por segurança, o link completo aparece somente agora. Gere outro se precisar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {portal.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : portal.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Não foi possível carregar os convites e acessos do cliente.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <UserRoundCheck className="size-4 text-primary" aria-hidden />
                <h2 className="font-semibold">Acessos</h2>
              </div>
              {(portal.data?.accesses.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nenhum cliente aceitou um convite ainda.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {portal.data?.accesses.map((access) => (
                    <li key={access.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{access.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Aceito em {formatDateTime(access.accepted_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge
                          label={access.is_active ? "Ativo" : "Desativado"}
                          tone={access.is_active ? "success" : "neutral"}
                        />
                        <Switch
                          checked={access.is_active}
                          disabled={setAccessActive.isPending}
                          aria-label={`${access.is_active ? "Desativar" : "Reativar"} acesso de ${access.email}`}
                          onCheckedChange={(active) => void toggleAccess(access.id, active)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold">Histórico de convites</h2>
              {(portal.data?.invitations.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">Nenhum convite criado.</p>
              ) : (
                <ul className="mt-4 divide-y divide-border">
                  {portal.data?.invitations.map((invitation) => {
                    const status = effectivePortalInvitationStatus(
                      invitation.status,
                      invitation.expires_at,
                    );
                    return (
                      <li
                        key={invitation.id}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{invitation.email}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Criado em {formatDateTime(invitation.created_at)} · expira em{" "}
                            {formatDateTime(invitation.expires_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge label={STATUS[status].label} tone={STATUS[status].tone} />
                          {status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cancelInvitation.isPending}
                              onClick={() => void cancel(invitation.id)}
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
