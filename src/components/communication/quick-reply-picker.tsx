import { MessageSquareText } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommunicationQuickReply } from "@/hooks/use-quick-replies";
import { activeQuickReplies } from "@/lib/quick-replies";

export function QuickReplyPicker({
  replies,
  onSelect,
  disabled = false,
  loading = false,
}: {
  replies: readonly CommunicationQuickReply[];
  onSelect: (content: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const active = activeQuickReplies(replies);
  if (!loading && active.length === 0) return null;

  return (
    <Select
      value="quick-reply-placeholder"
      disabled={disabled || loading}
      onValueChange={(id) => {
        const selected = active.find((reply) => reply.id === id);
        if (selected) onSelect(selected.content);
      }}
    >
      <SelectTrigger className="min-w-48" aria-label="Selecionar resposta rápida">
        <MessageSquareText className="size-4 shrink-0 text-primary" aria-hidden />
        <SelectValue placeholder={loading ? "Carregando modelos…" : "Resposta rápida"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="quick-reply-placeholder" disabled>
          Escolha um modelo
        </SelectItem>
        {active.map((reply) => (
          <SelectItem key={reply.id} value={reply.id}>
            {reply.title} · {reply.category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
