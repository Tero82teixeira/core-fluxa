import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/lib/workspace";
import {
  filterNotifications,
  notificationDestination,
  type Notification,
} from "@/lib/notifications";
import {
  useCreateTestNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/use-notifications";
import { PushNotificationSettings } from "@/components/notifications/push-notification-settings";
import { ErrorState, LoadingState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  component: NotificationsPage,
});
const filters = [
  ["all", "Todas"],
  ["unread", "Não lidas"],
  ["task", "Tarefas"],
  ["process", "Processos"],
  ["document", "Documentos"],
  ["monitoring", "Monitoramentos"],
  ["team", "Equipe"],
  ["integration", "Integrações"],
  ["health", "Saúde"],
  ["system", "Sistema"],
];

function NotificationsPage() {
  const { organizationId, role } = useWorkspace();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(20);
  const query = useNotifications(organizationId, limit);
  const mark = useMarkNotificationRead(organizationId);
  const markAll = useMarkAllNotificationsRead(organizationId);
  const createTest = useCreateTestNotification(organizationId);
  const canCreateTest = role === "proprietario" || role === "administrador";
  const rows = filterNotifications(query.data ?? [], filter);
  const unread = (query.data ?? []).filter((item) => !item.read_at).length;
  const open = async (notification: Notification) => {
    if (mark.isPending) return;
    try {
      await mark.mutateAsync({ _notification: notification.id });
      const destination = notificationDestination(notification);
      if (destination) await navigate({ to: destination });
    } catch {
      toast.error("Não foi possível abrir a notificação. Tente novamente.");
    }
  };
  const createTestNotification = () =>
    createTest.mutate(undefined, {
      onSuccess: () => toast.success("Notificação de teste criada."),
      onError: () => toast.error("Não foi possível criar a notificação de teste. Tente novamente."),
    });
  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div
          className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-rose-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:40px_40px]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-rose-400 text-slate-950 shadow-lg shadow-rose-400/20 ring-1 ring-white/10">
                <Bell className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-rose-300 uppercase">
                  Central de avisos
                </p>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
                  Notificações
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Acompanhe as atualizações importantes do seu workspace.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 font-medium text-white">
                {unread} não lida(s)
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {query.data?.length ?? 0} carregada(s)
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                {rows.length} no filtro atual
              </span>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 xl:w-auto xl:justify-end">
            {canCreateTest && (
              <Button
                className="flex-1 border-white/15 bg-white/[0.06] text-white hover:bg-white/10 hover:text-white sm:flex-none"
                variant="outline"
                disabled={createTest.isPending}
                onClick={createTestNotification}
              >
                {createTest.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Criar
                notificação de teste
              </Button>
            )}
            <Button
              className="flex-1 bg-white text-slate-950 hover:bg-slate-100 sm:flex-none"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate({ _organization: organizationId })}
            >
              <CheckCheck className="mr-2 size-4" />
              Marcar todas como lidas
            </Button>
          </div>
        </div>
      </header>
      <PushNotificationSettings organizationId={organizationId} />
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/8 text-primary">
              <SlidersHorizontal className="size-4" aria-hidden />
            </span>
            Filtrar notificações
          </div>
          <span className="text-xs text-muted-foreground">{rows.length} resultado(s)</span>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger
            className="h-10 w-full rounded-xl sm:w-60"
            aria-label="Filtrar notificações"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filters.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {query.isLoading ? (
        <LoadingState label="Carregando notificações" rows={4} />
      ) : query.isError ? (
        <ErrorState
          title="Não foi possível carregar as notificações"
          description="Tente novamente para recuperar as atualizações do seu workspace."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Bell}
              title="Nenhuma notificação encontrada"
              description={
                filter === "all"
                  ? "As novas atualizações do seu workspace aparecerão aqui."
                  : "Troque o filtro para consultar outras notificações."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((item) => (
            <Card
              key={item.id}
              className={`rounded-2xl shadow-soft transition-all hover:shadow-panel ${!item.read_at ? "border-brand/40 bg-brand/5" : "border-border/70"}`}
            >
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <button
                  className="min-w-0 flex-1 text-left disabled:cursor-wait disabled:opacity-60"
                  disabled={mark.isPending}
                  onClick={() => void open(item)}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {!item.read_at && <span className="size-2 rounded-full bg-brand" />}
                    {item.title}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{item.body}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.created_at))}{" "}
                    · {item.kind}
                  </span>
                </button>
                {!item.read_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mark.isPending}
                    onClick={() => mark.mutate({ _notification: item.id })}
                  >
                    Marcar como lida
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {(query.data?.length ?? 0) >= limit && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setLimit((v) => v + 20)}>
            Carregar mais
          </Button>
        </div>
      )}
    </main>
  );
}
