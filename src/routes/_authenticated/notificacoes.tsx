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
    await mark.mutateAsync({ _notification: notification.id });
    const destination = notificationDestination(notification);
    if (destination) await navigate({ to: destination });
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
        <Card>
          <CardContent className="flex items-center gap-2 p-8">
            <Loader2 className="size-4 animate-spin" />
            Carregando notificações…
          </CardContent>
        </Card>
      ) : query.isError ? (
        <Card>
          <CardContent className="p-8 text-destructive">
            Não foi possível carregar as notificações.
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Bell className="size-8" />
            <p>Nenhuma notificação encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((item) => (
            <Card key={item.id} className={!item.read_at ? "border-brand/40 bg-brand/5" : ""}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <button className="min-w-0 flex-1 text-left" onClick={() => void open(item)}>
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
