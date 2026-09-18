import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
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
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Notificações</h1>
          <p className="page-subtitle">Acompanhe as atualizações importantes do seu workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateTest && (
            <Button
              variant="ghost"
              disabled={createTest.isPending}
              onClick={createTestNotification}
            >
              {createTest.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Criar
              notificação de teste
            </Button>
          )}
          <Button
            variant="outline"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate({ _organization: organizationId })}
          >
            <CheckCheck className="mr-2 size-4" />
            Marcar todas como lidas
          </Button>
        </div>
      </header>
      <PushNotificationSettings organizationId={organizationId} />
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-full sm:w-60" aria-label="Filtrar notificações">
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
            <Card key={item.id} className={!item.read_at ? "border-brand/40 bg-brand/5" : ""}>
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
