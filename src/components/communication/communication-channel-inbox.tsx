import { Inbox, Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useMatchCommunicationChannelMessage,
  useUnmatchedCommunicationChannelMessages,
} from "@/hooks/use-communication-channels";
import type { ClientRow } from "@/hooks/use-operations";
import { describeError } from "@/lib/errors";
import { formatDate } from "@/lib/format";

export function CommunicationChannelInbox({
  organizationId,
  clients,
  canManage,
  onOpen,
}: {
  organizationId: string | null;
  clients: ClientRow[];
  canManage: boolean;
  onOpen: (threadId: string) => void;
}) {
  const query = useUnmatchedCommunicationChannelMessages(organizationId, canManage);
  const match = useMatchCommunicationChannelMessage(organizationId);
  const [selections, setSelections] = useState<Record<string, string>>({});
  if (!canManage || (!query.isLoading && (query.data?.length ?? 0) === 0)) return null;

  const connect = async (messageId: string) => {
    const clientId = selections[messageId];
    if (!clientId) return toast.error("Selecione o cliente desta mensagem.");
    try {
      const threadId = await match.mutateAsync({ messageId, clientId });
      toast.success("Mensagem vinculada ao cliente.");
      onOpen(threadId);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <Card className="border-amber-300/70">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Inbox className="size-4 text-amber-600" />
          <h2 className="font-semibold">Mensagens aguardando identificação</h2>
          <Badge variant="outline">{query.data?.length ?? 0}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Associe remetentes ainda não reconhecidos ao cadastro correto. As próximas mensagens serão
          identificadas automaticamente.
        </p>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {query.data?.map((message) => (
              <li key={message.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">
                    {message.channel === "whatsapp" ? "WhatsApp" : "E-mail"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(message.occurred_at)}
                  </span>
                </div>
                <p className="text-sm font-medium">{message.external_sender}</p>
                <p className="line-clamp-3 text-sm text-muted-foreground">{message.content}</p>
                <div className="flex gap-2">
                  <Select
                    value={selections[message.id] ?? ""}
                    onValueChange={(clientId) =>
                      setSelections({ ...selections, [message.id]: clientId })
                    }
                  >
                    <SelectTrigger className="min-w-0 flex-1">
                      <SelectValue placeholder="Selecionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    aria-label="Vincular mensagem"
                    onClick={() => void connect(message.id)}
                    disabled={match.isPending}
                  >
                    <Link2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
